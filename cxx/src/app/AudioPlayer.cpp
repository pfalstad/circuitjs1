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

#include "AudioPlayer.h"

#include <atomic>
#include <cstring>

#include "miniaudio.h"

struct AudioPlayer::Impl {
    ma_device device;
    bool deviceOpen = false;
    std::vector<short> samples;
    std::atomic<size_t> pos{0};
};

// called on miniaudio's audio thread
static void dataCallback(ma_device *device, void *output, const void *, ma_uint32 frameCount) {
    AudioPlayer::Impl *impl = static_cast<AudioPlayer::Impl *>(device->pUserData);
    short *out = static_cast<short *>(output);
    size_t pos = impl->pos.load();
    size_t n = 0;
    if (pos < impl->samples.size()) {
        n = std::min<size_t>(frameCount, impl->samples.size() - pos);
        std::memcpy(out, impl->samples.data() + pos, n * sizeof(short));
        impl->pos.store(pos + n);
    }
    // silence after the end
    std::memset(out + n, 0, (frameCount - n) * sizeof(short));
}

AudioPlayer::AudioPlayer() : impl(std::make_unique<Impl>()) {}

AudioPlayer::~AudioPlayer() {
    stop();
}

void AudioPlayer::stop() {
    if (impl->deviceOpen) {
        ma_device_uninit(&impl->device);
        impl->deviceOpen = false;
    }
}

bool AudioPlayer::play(const std::vector<short> &samples, int sampleRate) {
    stop();
    impl->samples = samples;
    impl->pos = 0;
    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.format = ma_format_s16;
    config.playback.channels = 1;
    config.sampleRate = (ma_uint32) sampleRate;
    config.dataCallback = dataCallback;
    config.pUserData = impl.get();
    if (ma_device_init(nullptr, &config, &impl->device) != MA_SUCCESS)
        return false;
    impl->deviceOpen = true;
    if (ma_device_start(&impl->device) != MA_SUCCESS) {
        stop();
        return false;
    }
    return true;
}

bool AudioPlayer::decodeFile(const std::string &path, std::vector<float> &data, int &sampleRate) {
    // keep the file's own channel count and rate; we take channel 0, like the TS version's
    // getChannelData(0)
    ma_decoder_config config = ma_decoder_config_init(ma_format_f32, 0, 0);
    ma_decoder decoder;
    if (ma_decoder_init_file(path.c_str(), &config, &decoder) != MA_SUCCESS)
        return false;
    ma_uint32 channels = decoder.outputChannels;
    sampleRate = (int) decoder.outputSampleRate;
    data.clear();
    std::vector<float> buf(4096 * channels);
    for (;;) {
        ma_uint64 framesRead = 0;
        ma_result r = ma_decoder_read_pcm_frames(&decoder, buf.data(), 4096, &framesRead);
        for (ma_uint64 i = 0; i != framesRead; i++)
            data.push_back(buf[i * channels]);
        if (r != MA_SUCCESS || framesRead < 4096)
            break;
    }
    ma_decoder_uninit(&decoder);
    return channels > 0 && sampleRate > 0;
}
