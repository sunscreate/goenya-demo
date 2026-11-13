cd "$(dirname "$0")"
python3 audio.py 2>&1 | grep -vE "warn|Warn|super|apply|it/s" > audio.log
for i in $(seq 0 29); do n=$(printf %02d $((i+1))); node render.js $i v_$n.mp4 && ./mux.sh $n || echo "FAIL $n"; done > render.log 2>&1
echo DONE >> render.log
