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

#include <memory>
#include <string>
#include <vector>

// plays and decodes audio with miniaudio (third_party/miniaudio)
class AudioPlayer {
public:
    AudioPlayer();
    ~AudioPlayer();

    // play 16-bit mono samples, replacing whatever is playing
    bool play(const std::vector<short> &samples, int sampleRate);
    void stop();

    // decode the first channel of an audio file (WAV, MP3, FLAC) at its own sample rate
    static bool decodeFile(const std::string &path, std::vector<float> &data, int &sampleRate);

    struct Impl;

private:
    std::unique_ptr<Impl> impl;
};
