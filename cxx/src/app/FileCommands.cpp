/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

// The File menu (Menus.ts) and its commands (CommandManager.ts, ImageExporter.ts)

#include <QAction>
#include <QApplication>
#include <QCheckBox>
#include <QClipboard>
#include <QDateTime>
#include <QDialog>
#include <QDialogButtonBox>
#include <QFile>
#include <QFileDialog>
#include <QLabel>
#include <QMenuBar>
#include <QPainter>
#include <QPlainTextEdit>
#include <QPrintDialog>
#include <QPrinter>
#include <QProcess>
#include <QPushButton>
#include <QRadioButton>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QSvgGenerator>
#include <QTextBrowser>
#include <QVBoxLayout>
#include <algorithm>
#include <cmath>

#include "CirSim.h"
#include "QtGraphics.h"
#include "Sidebar.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"
#include "core/Scope.h"
#include "core/LZString.h"
#include "core/Storage.h"

static const char *versionString = "5.0.4cxx (alpha)";

static QString LSq(const char *s) { return QString::fromStdString(Locale::LS(s)); }

void CirSim::createFileMenu() {
    QMenu *file = menuBar()->addMenu(menuTitle("File", tr("&File")));
    auto addItem = [&](const char *name, QKeySequence key, std::function<void()> fn) {
        QAction *a = file->addAction(LSq(name));
        if (!key.isEmpty())
            a->setShortcut(key);
        connect(a, &QAction::triggered, this, fn);
        return a;
    };
    addItem("New Window...", QKeySequence::New, [this] { newWindow(); });
    addItem("New Blank Circuit", QKeySequence(), [this] { newBlankCircuit(); });
    addItem("Open File...", QKeySequence::Open, [this] { openFile(); });
    addItem("Import From Text...", QKeySequence(), [this] { doImportFromText(); });
    addItem("Save", QKeySequence::Save, [this] { save(); });
    addItem("Save As...", QKeySequence::SaveAs, [this] { saveAs(); });
    addItem("Export As Link...", QKeySequence(), [this] { doExportAsUrl(); });
    addItem("Export As Text...", QKeySequence(), [this] { doExportAsText(); });
    addItem("Export As Image...", QKeySequence(), [this] { doExportAsImage(); });
    addItem("Copy Circuit Image to Clipboard", QKeySequence(), [this] { doImageToClipboard(); });
    addItem("Export As SVG...", QKeySequence(), [this] { doExportAsSVG(); });
    addItem("Create Subcircuit...", QKeySequence(), [this] { doCreateSubcircuit(); });
    addItem("Find DC Operating Point", QKeySequence(), [this] { doDCAnalysis(); });
    recoverItem = addItem("Recover Auto-Save", QKeySequence(), [this] { doRecover(); });
    recoverItem->setEnabled(recovery.has_value());
    addItem("Print...", QKeySequence::Print, [this] { doPrint(); });
    file->addSeparator();
    addItem("Toggle Full Screen", QKeySequence(), [this] { toggleFullScreen(); });
    file->addSeparator();
    QAction *about = addItem("About...", QKeySequence(), [this] { doAbout(); });
    about->setMenuRole(QAction::AboutRole);
}

void CirSim::newWindow() {
    QProcess::startDetached(QCoreApplication::applicationFilePath(), {});
}

void CirSim::toggleFullScreen() {
    if (isFullScreen())
        showNormal();
    else
        showFullScreen();
    // the canvas gets its new size later
    needCenter = true;
    repaint();
}

void CirSim::doDCAnalysis() {
    dcAnalysisFlag = true;
    resetAction();
}

void CirSim::doRecover() {
    if (!recovery || !maybeSave())
        return;
    pushUndo();
    resetEditingContext();
    readCircuit(*recovery);
    filePath.clear();
    recoverItem->setEnabled(false);
    unsavedChanges = false;
    savedDumpPending = true;
    setCircuitTitle(QString());
    setWindowTitle("CircuitJS1");
}

// a dialog with a title, a label, a text box, and buttons along the bottom
namespace {
struct TextDialog {
    QDialog *dialog;
    QPlainTextEdit *text;
    QHBoxLayout *buttons;
    QVBoxLayout *layout;

    TextDialog(QWidget *parent, const char *title, const char *label, const QString &contents) {
        dialog = new QDialog(parent);
        dialog->setAttribute(Qt::WA_DeleteOnClose);
        dialog->setWindowTitle(LSq(title));
        layout = new QVBoxLayout(dialog);
        QLabel *l = new QLabel(LSq(label));
        l->setWordWrap(true);
        layout->addWidget(l);
        text = new QPlainTextEdit(contents);
        text->setMinimumSize(400, 300);
        layout->addWidget(text);
        buttons = new QHBoxLayout();
        layout->addLayout(buttons);
    }
    QPushButton *addButton(const char *name, std::function<void()> fn) {
        QPushButton *b = new QPushButton(LSq(name));
        b->setAutoDefault(false);
        buttons->addWidget(b);
        QObject::connect(b, &QPushButton::clicked, dialog, fn);
        return b;
    }
    void addCopyButton() {
        QPlainTextEdit *t = text;
        addButton("Copy to Clipboard", [t] { QGuiApplication::clipboard()->setText(t->toPlainText()); });
    }
};
}  // namespace

void CirSim::doImportFromText() {
    TextDialog d(this, "Import from Text", "Paste the text file for your circuit here...", QString());
    d.text->setMinimumSize(300, 200);
    QCheckBox *subCheck = new QCheckBox(LSq("Load Subcircuits Only"));
    d.layout->insertWidget(2, subCheck);
    QDialog *dialog = d.dialog;
    QPlainTextEdit *text = d.text;
    d.addButton("OK", [this, dialog, text, subCheck] {
        std::string s = text->toPlainText().toStdString();
        bool subs = subCheck->isChecked();
        dialog->close();
        importCircuitFromText(s, subs);
    });
    d.addButton("Cancel", [dialog] { dialog->close(); });
    d.buttons->addStretch();
    dialog->show();
}

void CirSim::importCircuitFromText(const std::string &text, bool subcircuitsOnly) {
    // subcircuit library files don't replace the circuit
    if (CircuitLoader::isSubcircuitLibrary(text))
        subcircuitsOnly = true;
    if (subcircuitsOnly) {
        pushUndo();
        readCircuit(text, CircuitLoader::RC_SUBCIRCUITS | CircuitLoader::RC_RETAIN | CircuitLoader::RC_NO_CENTER);
        return;
    }
    if (!maybeSave())
        return;
    pushUndo();
    resetEditingContext();
    readCircuit(text);
    filePath.clear();
    unsavedChanges = false;
    savedDumpPending = true;
    setCircuitTitle(QString());
    setWindowTitle("CircuitJS1");
}

void CirSim::doExportAsText() {
    TextDialog d(this, "Export as Text", "Text file for this circuit is...", QString::fromStdString(dumpCircuit()));
    QDialog *dialog = d.dialog;
    QPlainTextEdit *text = d.text;
    d.addButton("OK", [dialog] { dialog->close(); });
    d.addCopyButton();
    d.buttons->addStretch();
    d.addButton("Re-Import", [this, dialog, text] {
        std::string s = text->toPlainText().toStdString();
        dialog->close();
        importCircuitFromText(s, false);
    });
    dialog->show();
}

void CirSim::doExportAsUrl() {
    QString dump = QString::fromStdString(dumpCircuit());
    QString url = "https://www.falstad.com/circuit/circuitjs.html?ctz=" +
                  QString::fromStdString(LZString::compressToEncodedURIComponent(dump.toStdU16String()));
    TextDialog d(this, "Export as URL", "URL for this circuit is...", url);
    if (url.length() > 2000) {
        QLabel *warning = new QLabel(LSq("Warning: this URL is longer than 2000 characters and may not work in some browsers."));
        warning->setWordWrap(true);
        d.layout->insertWidget(1, warning);
    }
    QDialog *dialog = d.dialog;
    d.addButton("OK", [dialog] { dialog->close(); });
    d.addCopyButton();
    d.buttons->addStretch();
    dialog->show();
}

void CirSim::doAbout() {
    QFile f(resourceDir() + "/help/about.html");
    QString html;
    if (f.open(QIODevice::ReadOnly))
        html = QString::fromUtf8(f.readAll());
    html.replace(QRegularExpression("<script>.*</script>", QRegularExpression::DotMatchesEverythingOption), "");
    html.replace("<span class=\"ver\"></span>", versionString);
    QDialog *dialog = new QDialog(this);
    dialog->setAttribute(Qt::WA_DeleteOnClose);
    dialog->setWindowTitle(LSq("About"));
    QVBoxLayout *layout = new QVBoxLayout(dialog);
    QTextBrowser *browser = new QTextBrowser();
    browser->setOpenExternalLinks(true);
    browser->setHtml(html.isEmpty() ? QString("Circuit Simulator version ") + versionString : html);
    browser->setMinimumSize(420, 430);
    layout->addWidget(browser);
    QDialogButtonBox *box = new QDialogButtonBox(QDialogButtonBox::Ok);
    connect(box, &QDialogButtonBox::accepted, dialog, &QDialog::close);
    layout->addWidget(box);
    dialog->show();
}

// the recovery file: the circuit as of the last change, kept across sessions (UndoManager.ts)
void CirSim::writeRecoveryToStorage() {
    if (Storage::localStorage)
        Storage::localStorage->setItem("circuitRecovery", dumpCircuit());
}

void CirSim::readRecovery() {
    if (Storage::localStorage)
        recovery = Storage::localStorage->getItem("circuitRecovery");
}

// ---- ImageExporter.ts ----

// add some space on edges because bounds calculation is not perfect
static const int wmargin = 140;
static const int hmargin = 100;

static QString defaultFileName(const char *ext) {
    QString dir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    return dir + "/circuit-" + QDateTime::currentDateTime().toString("yyyyMMdd-HHmm") + ext;
}

Rectangle CirSim::imageBounds() {
    return getCircuitBounds().value_or(Rectangle(0, 0, 0, 0));
}

void CirSim::drawCircuitInPainter(QPainter &painter, int type, const Rectangle &bounds, double w, double h) {
    QtGraphics g(painter);
    double oldTransform[6];
    std::copy(transform, transform + 6, oldTransform);

    // turn on white background, turn off current display
    bool p = options.printable;
    bool c = options.dots;
    if (type == CAC_PRINT)
        options.printable = true;
    if (options.printable) {
        CircuitElm::whiteColor = Color::black;
        CircuitElm::lightGrayColor = Color::black;
        g.setColor(Color::white);
    } else {
        CircuitElm::whiteColor = Color::white;
        CircuitElm::lightGrayColor = Color::lightGray;
        g.setColor(Color::black);
    }
    g.fillRect(0, 0, w, h);
    options.dots = false;

    double scale = std::min(w / (bounds.width + wmargin), h / (bounds.height + hmargin));

    // ScopeElms need the transform array to be updated
    transform[0] = transform[3] = scale;
    transform[1] = transform[2] = 0;
    transform[4] = -(bounds.x - wmargin / 2);
    transform[5] = -(bounds.y - hmargin / 2);
    g.scale(scale, scale);
    g.translate(transform[4], transform[5]);
    g.setLineCap(Graphics::CAP_ROUND);

    for (CircuitElm *ce : *uiElmList)
        ce->draw(g);
    for (const Point &pt : postDrawList)
        CircuitElm::drawPost(g, pt);

    // restore everything
    options.printable = p;
    options.dots = c;
    std::copy(oldTransform, oldTransform + 6, transform);
}

QImage CirSim::getCircuitAsImage(int type) {
    Rectangle bounds = imageBounds();
    // max image dimensions; the TS version stays under browser canvas limits
    const double maxDim = 16000, maxArea = 250000000;
    double baseW = bounds.width + wmargin;
    double baseH = bounds.height + hmargin;

    // oversample by up to 2x for quality
    double factor = 2;
    factor = std::min(factor, maxDim / baseW);
    factor = std::min(factor, maxDim / baseH);
    factor = std::min(factor, std::sqrt(maxArea / (baseW * baseH)));

    int w = (int) std::round(bounds.width * factor + wmargin);
    int h = (int) std::round(bounds.height * factor + hmargin);
    QImage img(w, h, QImage::Format_ARGB32);
    QPainter painter(&img);
    drawCircuitInPainter(painter, type, bounds, w, h);
    painter.end();
    repaint();
    return img;
}

void CirSim::doExportAsImage() {
    QImage img = getCircuitAsImage(CAC_IMAGE);
    QString path = QFileDialog::getSaveFileName(this, LSq("Export As Image..."), defaultFileName(".png"),
                                                "PNG (*.png);;" + LSq("All files") + " (*)");
    if (path.isEmpty())
        return;
    if (!img.save(path, "PNG"))
        alert(Locale::LS("Can't save file"));
}

void CirSim::doImageToClipboard() {
    QGuiApplication::clipboard()->setImage(getCircuitAsImage(CAC_IMAGE));
}

void CirSim::doExportAsSVG() {
    QString path = QFileDialog::getSaveFileName(this, LSq("Export As SVG..."), defaultFileName(".svg"),
                                                "SVG (*.svg);;" + LSq("All files") + " (*)");
    if (path.isEmpty())
        return;
    Rectangle bounds = imageBounds();
    double w = bounds.width + wmargin;
    double h = bounds.height + hmargin;
    QSvgGenerator gen;
    gen.setFileName(path);
    gen.setSize(QSize((int) std::ceil(w), (int) std::ceil(h)));
    gen.setViewBox(QRectF(0, 0, w, h));
    gen.setTitle(sidebar->circuitTitle());
    QPainter painter;
    if (!painter.begin(&gen)) {
        alert(Locale::LS("Can't save file"));
        return;
    }
    drawCircuitInPainter(painter, CAC_SVG, bounds, w, h);
    painter.end();
    repaint();
}

static QString documentsPath(const char *name) {
    return QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation) + "/" + name;
}

void CirSim::exportScopeCSV(Scope *s) {
    std::string csv = s->getCSV();
    if (csv.empty())
        return;
    QString path = QFileDialog::getSaveFileName(this, LSq("Export CSV..."), documentsPath("scope-data.csv"),
                                                "CSV (*.csv);;" + LSq("All files") + " (*)");
    if (path.isEmpty())
        return;
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate) || f.write(QByteArray::fromStdString(csv)) < 0)
        alert(Locale::LS("Can't save file"));
}

bool CirSim::writeScopeImage(Scope *s, const QString &path, bool svg, bool transparent) {
    double w = s->rect.width, h = s->rect.height;
    if (svg) {
        QSvgGenerator gen;
        gen.setFileName(path);
        gen.setSize(QSize((int) std::ceil(w), (int) std::ceil(h)));
        gen.setViewBox(QRectF(0, 0, w, h));
        QPainter painter;
        if (!painter.begin(&gen))
            return false;
        QtGraphics g(painter);
        s->drawForExport(g, transparent);
        return painter.end();
    }
    // render at the display's pixel density so the PNG is as sharp as the on-screen scope
    double scale = devicePixelRatioF();
    QImage img((int) std::round(w * scale), (int) std::round(h * scale), QImage::Format_ARGB32);
    img.fill(Qt::transparent);
    QPainter painter(&img);
    painter.scale(scale, scale);
    QtGraphics g(painter);
    s->drawForExport(g, transparent);
    painter.end();
    return img.save(path, "PNG");
}

// asks for image format (PNG/SVG) and background options, then exports a scope
void CirSim::exportScopeImage(Scope *s) {
    // remember last choices for the session
    static bool lastSVG = false;
    static bool lastTransparent = false;

    QDialog dlg(this);
    dlg.setWindowTitle(LSq("Export Image"));
    auto *layout = new QVBoxLayout(&dlg);
    auto *pngRadio = new QRadioButton(LSq("PNG"), &dlg);
    auto *svgRadio = new QRadioButton(LSq("SVG"), &dlg);
    pngRadio->setChecked(!lastSVG);
    svgRadio->setChecked(lastSVG);
    auto *transparentCheck = new QCheckBox(LSq("Transparent Background"), &dlg);
    transparentCheck->setChecked(lastTransparent);
    auto *buttons = new QDialogButtonBox(QDialogButtonBox::Ok | QDialogButtonBox::Cancel, &dlg);
    connect(buttons, &QDialogButtonBox::accepted, &dlg, &QDialog::accept);
    connect(buttons, &QDialogButtonBox::rejected, &dlg, &QDialog::reject);
    layout->addWidget(pngRadio);
    layout->addWidget(svgRadio);
    layout->addWidget(transparentCheck);
    layout->addWidget(buttons);
    if (dlg.exec() != QDialog::Accepted)
        return;
    bool svg = lastSVG = svgRadio->isChecked();
    bool transparent = lastTransparent = transparentCheck->isChecked();

    QString path = QFileDialog::getSaveFileName(this, LSq("Export Image..."), documentsPath(svg ? "scope.svg" : "scope.png"),
                                                svg ? "SVG (*.svg);;" + LSq("All files") + " (*)"
                                                    : "PNG (*.png);;" + LSq("All files") + " (*)");
    if (path.isEmpty())
        return;
    if (!writeScopeImage(s, path, svg, transparent))
        alert(Locale::LS("Can't save file"));
    repaint();
}

void CirSim::doPrint() {
    QPrinter printer(QPrinter::HighResolution);
    QPrintDialog dlg(&printer, this);
    if (dlg.exec() != QDialog::Accepted)
        return;
    QPainter painter;
    if (!painter.begin(&printer)) {
        alert(Locale::LS("Can't print"));
        return;
    }
    // fit the circuit to the page, centered.  Print an image of it, like the TS version;
    // the macOS print engine can't stroke with gradients (resistors, inductors).
    Rectangle bounds = imageBounds();
    double pw = printer.width(), ph = printer.height();
    double scale = std::min(pw / (bounds.width + wmargin), ph / (bounds.height + hmargin));
    double w = (bounds.width + wmargin) * scale;
    double h = (bounds.height + hmargin) * scale;
    // render at 300 dpi at most
    double res = std::min(1.0, 300.0 / printer.resolution());
    QImage img((int) std::ceil(w * res), (int) std::ceil(h * res), QImage::Format_ARGB32);
    QPainter ip(&img);
    drawCircuitInPainter(ip, CAC_PRINT, bounds, img.width(), img.height());
    ip.end();
    painter.setRenderHint(QPainter::SmoothPixmapTransform, true);
    painter.drawImage(QRectF((pw - w) / 2, (ph - h) / 2, w, h), img);
    painter.end();
    repaint();
}
