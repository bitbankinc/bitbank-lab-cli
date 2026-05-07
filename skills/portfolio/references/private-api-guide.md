# Private API リファレンス

## 認証設定

### .env ファイル

```
BITBANK_API_KEY=your_api_key
BITBANK_API_SECRET=your_api_secret
```

### 実行方法

`.env` を環境変数として読み込んでから呼び出す（詳細は
`_shared/references/cli-conventions.md` の「認証」を参照）:

```bash
set -a; source .env; set +a
bitbank <command> --format=json
```

## assets レスポンス形式

```json
{
  "success": 1,
  "data": {
    "assets": [
      {
        "asset": "btc",
        "amount_precision": 8,
        "onhand_amount": "0.15000000",
        "locked_amount": "0.00000000",
        "free_amount": "0.15000000",
        "stop_deposit": false,
        "stop_withdrawal": false,
        "withdrawal_fee": {
          "under": "0.00060000",
          "over": "0.00100000",
          "threshold": "30000.0000"
        }
      }
    ]
  }
}
```

**フィールド説明:**
- `onhand_amount`: 総保有量（注文ロック分を含む）
- `locked_amount`: 注文でロックされている量
- `free_amount`: 利用可能量（= onhand - locked）
- すべて**文字列**

## ticker レスポンス形式

```json
{
  "success": 1,
  "data": {
    "sell": "9300000",
    "buy": "9250000",
    "high": "9400000",
    "low": "9100000",
    "open": "9200000",
    "last": "9280000",
    "vol": "1234.5678",
    "timestamp": 1709251200000
  }
}
```

- `last`: 最終取引価格。ポートフォリオ評価には `last` を使う
- すべて**文字列**

## エラーコード

| コード | 意味 | 対処 |
|---|---|---|
| 20001 | 認証失敗 | `.env` の API キー/シークレットを確認 |
| 20002 | API キー不正 | bitbank でキーを再生成 |
| 20003 | 権限不足 | API キーの権限設定を確認（参照権限が必要） |
| 60001 | レート制限 | 1秒待ってリトライ |
