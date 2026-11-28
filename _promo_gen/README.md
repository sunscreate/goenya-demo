# 英語の宣伝動画ジェネレーター（公開されないフォルダ）
- stage.html：1080x1920 の画面（見出し・スマホ枠・指・バッジ）。アプリを iframe で開いて時間ごとに1コマずつ撮る
- specs.js：動画ごとの台本（見出し・ナレーション・タップ操作）。新しい動画はここに足す
- make.js：ナレーション（edge-tts）→ 画面撮影 → 音声合成 → promo/en_<名前>_voice.mp4（音楽あり・Instagram）/ _silent.mp4（声のみ・TikTok）
- 準備：build/app に try/*.html を FULL=true・demo帯なしでコピー、build/site にトップページ一式、build/stage.html。build で `python3 -m http.server 8099`
- 実行：NODE_PATH=$(npm root -g) node make.js <名前|all>
- 既に作った内容（promo/posts.json）と同じ画面・同じ操作の動画は作らない
