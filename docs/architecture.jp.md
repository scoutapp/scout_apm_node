# アーキテクチャ #

![Basic architecture image](https://github.com/scoutapp/scout_apm_node/blob/master/docs/architecture.jp.svg)

## Scout エージェント (アプリ内) ##

`Scout`のオブジェクト通じてコアエージェントのアクセスを出来るし他の便利なファンクションを実行出来ます。Scoutのエージェントは`core-agent`をローンチすることも可能です。

Scoutのエージェントの中に様々のコンポーネントで作られています:

- `AgentDownloader`は`core-agent`のダウンロード出来るコンポーネント(例:`WebAgentDownloader`)
- `Agent`はコアエージェントを管理出来るコンポーネント(例 `ExternalProcessAgent`)

## Scout コアエージェント (アプリ外) ##

`core-agent`はScoutのクラウドAPMと繋げるコンポーネントです。効率的にリクエストのトレースやアプリケーションのメットリックを送ります。

## プラッグイン ##

様々のプラグインでScoutを簡単に使えます。プラグイン毎に設定が変わります。

このレポジトリーに含めているExpressJSのプラグインを使ってリクエストのトレースを自動で送ることは可能です。ExpressJSのプラグインのリクエストタイムアウト設定でリクエストのリミットを設定出来ます。
