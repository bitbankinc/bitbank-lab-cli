# bitbank ペア分類表

bitbank 上の実際の出来高シェアに基づくペアの流動性カテゴリ。
異常値閾値やデータ検証の判定基準など、ペア特性に依存するロジックはこのテーブルを参照する。

## 分類基準

**24h 出来高シェア（JPY 建て売買代金の割合）** で 3 段階に分類。

| カテゴリ | 基準 | 特徴 |
|---------|------|------|
| major | 10% 以上 | 高流動性。板が厚く、スプレッドが狭い。出来高ゼロはまず発生しない |
| mid | 1〜10% | 中流動性。日中は板があるが、深夜帯は薄くなることがある |
| minor | 1% 未満 | 低流動性。出来高ゼロ足が散発。スプレッドが広く、ヒゲが出やすい |

## 分類テーブル

### major（出来高シェア 10% 以上）

| ペア | 出来高シェア目安 | 備考 |
|------|----------------|------|
| btc_jpy | ~30% | 最大の出来高。基軸通貨 |
| xrp_jpy | ~25% | bitbank は XRP 取引量で世界トップクラス |
| eth_jpy | ~16% | 安定した流動性 |

### mid（出来高シェア 1〜10%）

| ペア | 出来高シェア目安 | 備考 |
|------|----------------|------|
| doge_jpy | ~7% | ミーム系だが bitbank では出来高が大きい |
| sol_jpy | ~3% | 比較的新しい上場だが成長中 |
| ltc_jpy | — | 古参ペア。一定の取引あり |
| ada_jpy | — | 安定した取引量 |
| avax_jpy | — | |
| dot_jpy | — | |
| bnb_jpy | — | |
| sui_jpy | — | 新規上場組で注目度高い |
| link_jpy | — | |

### minor（出来高シェア 1% 未満）

| ペア | 備考 |
|------|------|
| mona_jpy | 日本発だが出来高は小さい |
| bcc_jpy | Bitcoin Cash |
| xlm_jpy | |
| qtum_jpy | |
| bat_jpy | |
| omg_jpy | |
| xym_jpy | |
| boba_jpy | |
| enj_jpy | |
| astr_jpy | |
| axs_jpy | |
| flr_jpy | |
| sand_jpy | |
| gala_jpy | |
| ape_jpy | |
| chz_jpy | |
| oas_jpy | |
| mana_jpy | |
| grt_jpy | |
| dai_jpy | ステーブルコイン。ボラは極小だが出来高も小 |
| op_jpy | |
| arb_jpy | |
| klay_jpy | |
| imx_jpy | |
| mask_jpy | |
| pol_jpy | |
| cyber_jpy | |
| render_jpy | |
| trx_jpy | |
| lpt_jpy | |
| atom_jpy | |
| sky_jpy | |

## 上場廃止・取引停止中のペア

以下のペアは bitbank API ドキュメント上で取引停止（is_enabled=false）:

`mkr_jpy`, `matic_jpy`, `rndr_jpy`, 全 BTC 建てペア（`xrp_btc`, `eth_btc` 等）

## データソース

- 出来高シェア: CoinGecko / Web 検索による bitbank 24h volume 内訳（2026年4月時点）
- ペア一覧: [bitbank API docs pairs.md](https://github.com/bitbankinc/bitbank-api-docs/blob/master/pairs.md)
- `—` のペアは個別の出来高データが取得できなかったため、カテゴリのみ推定

## 更新方法

出来高シェアは市況により変動する。定期的な見直しを推奨。

```bash
# 全ペアの ticker を取得して出来高を確認
bitbank ticker --pair=btc_jpy --format=json --machine
bitbank ticker --pair=xrp_jpy --format=json --machine
# ... 各ペアの vol フィールドを比較（data.vol）
```

出来高シェアが大きく変動した場合（例: 新規上場ペアが急成長）、
このテーブルのカテゴリを更新し、依存する Skill の閾値も連動して変わる。

## このファイルの利用先

- `data-verification` Skill: 異常値閾値、出来高ゼロ判定
- `indicator-analysis` Skill: （将来）ペア特性に応じた指標パラメータ調整
- MCP サーバー（bitbank-lab-mcp）: 同一の分類基準を共有
