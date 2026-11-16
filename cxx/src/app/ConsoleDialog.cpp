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

#include "ConsoleDialog.h"

#include <QApplication>
#include <QClipboard>
#include <QFontDatabase>
#include <QHBoxLayout>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QVBoxLayout>
#include <mutex>
#include <string>

#include "core/Locale.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

ConsoleDialog *ConsoleDialog::theConsole = nullptr;

// passes everything on to the original stream buffer, and each complete line to the console
class TeeBuf : public std::streambuf {
public:
    TeeBuf(std::streambuf *o, ConsoleDialog *c) : orig(o), console(c) {}

protected:
    int overflow(int ch) override {
        if (ch == traits_type::eof())
            return traits_type::not_eof(ch);
        char c = (char) ch;
        xsputn(&c, 1);
        return ch;
    }
    std::streamsize xsputn(const char *s, std::streamsize n) override {
        orig->sputn(s, n);
        std::lock_guard<std::mutex> lock(mutex);
        for (std::streamsize i = 0; i < n; i++) {
            if (s[i] == '\n') {
                console->post(QString::fromStdString(line));
                line.clear();
            } else
                line += s[i];
        }
        return n;
    }
    int sync() override { return orig->pubsync(); }

private:
    std::streambuf *orig;
    ConsoleDialog *console;
    std::mutex mutex;
    std::string line;
};

ConsoleDialog::ConsoleDialog() {
    theConsole = this;
    setWindowTitle(LS("Console"));
    // an open console shouldn't keep the app running after the main window closes
    setAttribute(Qt::WA_QuitOnClose, false);
    resize(700, 400);
    QVBoxLayout *v = new QVBoxLayout(this);

    text = new QPlainTextEdit();
    text->setReadOnly(true);
    text->setLineWrapMode(QPlainTextEdit::NoWrap);
    text->setMaximumBlockCount(10000);
    text->setFont(QFontDatabase::systemFont(QFontDatabase::FixedFont));
    v->addWidget(text);

    QHBoxLayout *buttons = new QHBoxLayout();
    auto addButton = [&](const char *label, void (ConsoleDialog::*handler)()) {
        QPushButton *b = new QPushButton(LS(label));
        b->setAutoDefault(false);
        connect(b, &QPushButton::clicked, this, handler);
        buttons->addWidget(b);
    };
    addButton("Clear", &ConsoleDialog::clear);
    addButton("Copy All", &ConsoleDialog::copyAll);
    buttons->addStretch();
    QPushButton *close = new QPushButton(LS("Close"));
    connect(close, &QPushButton::clicked, this, &QDialog::close);
    buttons->addWidget(close);
    v->addLayout(buttons);

    errBuf = std::make_unique<TeeBuf>(std::cerr.rdbuf(), this);
    outBuf = std::make_unique<TeeBuf>(std::cout.rdbuf(), this);
    oldErr = std::cerr.rdbuf(errBuf.get());
    oldOut = std::cout.rdbuf(outBuf.get());
    oldHandler = qInstallMessageHandler(messageHandler);
}

ConsoleDialog::~ConsoleDialog() {
    qInstallMessageHandler(oldHandler);
    std::cerr.rdbuf(oldErr);
    std::cout.rdbuf(oldOut);
    theConsole = nullptr;
}

void ConsoleDialog::showConsole() {
    show();
    raise();
    activateWindow();
}

void ConsoleDialog::post(const QString &line) {
    // queued, so lines from other threads are added on the GUI thread
    QMetaObject::invokeMethod(this, [this, line] { text->appendPlainText(line); }, Qt::QueuedConnection);
}

void ConsoleDialog::clear() { text->clear(); }

void ConsoleDialog::copyAll() { QApplication::clipboard()->setText(text->toPlainText()); }

void ConsoleDialog::messageHandler(QtMsgType type, const QMessageLogContext &ctx, const QString &msg) {
    if (theConsole) {
        if (theConsole->oldHandler)
            theConsole->oldHandler(type, ctx, msg);
        theConsole->post(msg);
    }
}
