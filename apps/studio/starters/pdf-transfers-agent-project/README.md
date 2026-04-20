# PDF Transfers Agent Starter

Proyecto Studio listo para abrir en `apps/studio/starters/pdf-transfers-agent-project`.

## Flujo (sin `python.execute`)

1. `trigger.manual` (`Manual Trigger`)
2. `control.set_variable` (`Set Output CSV Path`)
3. `control.set_variable` (`Set Rejected CSV Path`)
4. `files.list` (`List PDF Files`)
5. `control.map` (`Load PDF Texts`)
: transforma cada ruta PDF en `{ source_pdf, text }`.
6. `ai.model` (`AI Model`)
7. `ai.agent` (`Extract Transfers Agent`)
8. `api.parse_json` (`Parse Agent JSON`)
9. `control.map` (`Normalize Transfer Signs`)
10. `control.filter` (`Validate Transfer Rows`)
11. `data.target.csv` (`Write Transfers CSV`)
12. `control.filter` (`Collect Rejected Rows`)
13. `data.target.csv` (`Write Rejected CSV`)
14. `logging.log` (`Success Log` / `Error Log`)

## Configuración mínima

- Nodo `List PDF Files`:
  - `source`: prefijo/carpeta de PDFs (si no usas provider conectado).
  - `pattern`: por defecto `*.pdf`.
  - `max_items`: por defecto `1000` (procesa múltiples PDFs por corrida).
- Nodo `Set Output CSV Path`:
  - `value`: ruta completa del CSV final (ejemplo: `/.../quickbooks_transfers.csv`).
- Nodo `Set Rejected CSV Path`:
  - `value`: ruta completa del CSV de cuarentena (ejemplo: `/.../quickbooks_transfers_rejected.csv`).
- Nodo `AI Model` y `Extract Transfers Agent.model_config`:
  - `api_key`: `${env.OPENAI_API_KEY}` (o tu proveedor equivalente).
- Nodo `Extract Transfers Agent`:
  - `execution_mode`: `per_item`.
  - `items`: `${node:pdfs-to-documents|results}`.
  - `item_var`: `document`.

## Nota

Este starter elimina `python.execute` y mantiene la extracción en `ai.agent`.
En `per_item`, el agente procesa 1 PDF por iteración y luego agrega resultados.
La salida esperada por iteración es JSON estricto con `records`:
`{"records":[{"Date":"MM/DD/YYYY","Description":"...","Amount":-20.0}]}`.

Luego `Normalize Transfer Signs` aplica normalización determinística:
- `Payment/Credit/Refund/Reversal/Adjustment/Abono` => positivo.
- resto (compra/cargo/fee/interés/retiro) => negativo.

`Validate Transfer Rows` deja solo filas completas (Date/Description/Amount).
`Collect Rejected Rows` guarda las filas inválidas en CSV separado para auditoría.
