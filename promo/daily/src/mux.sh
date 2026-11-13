#!/bin/bash
# mux.sh NN : v_NN.mp4 + voice_NN.wav + bgm_NN.wav -> out/NN_voice.mp4 , out/NN_silent.mp4
set -e; n=$1; mkdir -p out
ffmpeg -loglevel error -y -i v_$n.mp4 -i voice_$n.wav -i bgm_$n.wav -filter_complex "[1]aformat=channel_layouts=stereo,highpass=f=80,loudnorm=I=-15:TP=-2,aresample=48000,asplit[v][sc];[2]aformat=channel_layouts=stereo,aresample=48000,volume=-13dB[m];[m][sc]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[md];[v][md]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.89,apad[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -t 10 out/${n}_voice.tmp.mp4
mv out/${n}_voice.tmp.mp4 out/${n}_voice.mp4
ffmpeg -loglevel error -y -i v_$n.mp4 -c:v copy -an out/${n}_silent.tmp.mp4 && mv out/${n}_silent.tmp.mp4 out/${n}_silent.mp4
