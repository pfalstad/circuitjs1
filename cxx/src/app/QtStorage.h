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

#include <QSettings>
#include <QUrl>

#include "core/Storage.h"

// localStorage on top of QSettings.  Keys are percent-encoded, since QSettings treats
// '/' as a group separator and model names can contain anything.
class QtStorage : public Storage {
public:
    QtStorage() : settings("lushprojects.com", "CircuitJS1") {}

    std::optional<std::string> getItem(const std::string &key) override {
        QVariant v = settings.value(encode(key));
        if (!v.isValid())
            return std::nullopt;
        return v.toString().toStdString();
    }
    void setItem(const std::string &key, const std::string &value) override {
        settings.setValue(encode(key), QString::fromStdString(value));
    }
    void removeItem(const std::string &key) override { settings.remove(encode(key)); }
    std::vector<std::string> keys() override {
        std::vector<std::string> out;
        settings.beginGroup(group);
        for (const QString &k : settings.childKeys())
            out.push_back(QUrl::fromPercentEncoding(k.toUtf8()).toStdString());
        settings.endGroup();
        return out;
    }

private:
    static constexpr const char *group = "localStorage";
    static QString encode(const std::string &key) {
        return QString(group) + "/" + QString::fromUtf8(QUrl::toPercentEncoding(QString::fromStdString(key)));
    }
    QSettings settings;
};
