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

#pragma once

#include <QDialog>
#include <QtGlobal>
#include <iostream>
#include <memory>

class QPlainTextEdit;
class TeeBuf;

// Tools > Console: shows what the app writes to std::cerr and std::cout
// (SimulationManager::console() among them) and Qt's warnings, since a
// native app has no browser console.  Output still goes to the terminal too.
// Create one in main(), before anything that might log, and keep it alive
// until everything else is gone; it captures output from then on.
class ConsoleDialog : public QDialog {
public:
    ConsoleDialog();
    ~ConsoleDialog() override;

    static ConsoleDialog *instance() { return theConsole; }
    void showConsole();

    // add a line; may be called from any thread
    void post(const QString &line);

private:
    void clear();
    void copyAll();
    static void messageHandler(QtMsgType type, const QMessageLogContext &ctx, const QString &msg);

    static ConsoleDialog *theConsole;
    QPlainTextEdit *text;
    std::unique_ptr<TeeBuf> errBuf, outBuf;
    std::streambuf *oldErr, *oldOut;
    QtMessageHandler oldHandler;
};
