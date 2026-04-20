# PDF Statements to QBO Project

Starter de proyecto listo para abrir en Studio con un bot completo:

- Lee PDFs de estados de cuenta desde una carpeta.
- Extrae transacciones con LLM.
- Consolida todo en CSV.
- Genera QBO (OFX) para QuickBooks.

## Estructura

- `proyecto.skuld`
- `bots/pdf-statements-to-qbo/bot.json`

## Configuración mínima antes de ejecutar

1. Abre el proyecto desde Studio.
2. En el nodo `PDF Input Provider`, configura `Path` con tu carpeta de PDFs.
3. En el nodo `Output Provider`, configura `Path` con tu carpeta de salida.
4. En el nodo `LLM Extractor Model`, configura proveedor/modelo y credencial (`api_key`).
5. En el nodo `Write QBO`, ajusta `account_type`, `account_id`, `bank_id` según tu banco.

## Output esperado

En la carpeta de salida:

- `transactions_extracted.csv`
- `bank_transactions.qbo`

