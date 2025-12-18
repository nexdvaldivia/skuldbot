# Studio Editor - Roadmap Completo

## Completado
- [x] Editor visual con React Flow
- [x] Nodos básicos (web, archivos, variables)
- [x] Sistema de proyectos con múltiples bots
- [x] Drag & drop de nodos
- [x] Panel de propiedades con inputs/outputs
- [x] Auto-guardado silencioso
- [x] Variables de entorno
- [x] Configuración de proyecto
- [x] Triggers (Manual, Form)

---

## NODOS

### Web Automation
- [ ] browser.open - Abrir navegador
- [ ] browser.close - Cerrar navegador
- [ ] browser.navigate - Navegar a URL
- [ ] browser.click - Click en elemento
- [ ] browser.fill - Llenar campo
- [ ] browser.select - Seleccionar opción
- [ ] browser.screenshot - Captura de pantalla
- [ ] browser.pdf - Exportar página a PDF
- [ ] browser.wait - Esperar elemento/condición
- [ ] browser.scroll - Scroll en página
- [ ] browser.execute_js - Ejecutar JavaScript
- [ ] browser.get_text - Obtener texto
- [ ] browser.get_attribute - Obtener atributo
- [ ] browser.get_table - Extraer tabla HTML
- [ ] browser.upload - Subir archivo
- [ ] browser.download - Descargar archivo
- [ ] browser.switch_tab - Cambiar pestaña
- [ ] browser.switch_frame - Cambiar iframe
- [ ] browser.hover - Hover sobre elemento
- [ ] browser.drag_drop - Arrastrar y soltar
- [ ] browser.keyboard - Enviar teclas
- [ ] browser.alert_handle - Manejar alertas

### Desktop Automation
- [ ] desktop.click - Click en coordenadas/imagen
- [ ] desktop.type - Escribir texto
- [ ] desktop.hotkey - Combinación de teclas
- [ ] desktop.screenshot - Captura de pantalla
- [ ] desktop.find_image - Buscar imagen en pantalla
- [ ] desktop.wait_image - Esperar imagen
- [ ] desktop.mouse_move - Mover mouse
- [ ] desktop.mouse_scroll - Scroll
- [ ] desktop.window_focus - Enfocar ventana
- [ ] desktop.window_minimize - Minimizar
- [ ] desktop.window_maximize - Maximizar
- [ ] desktop.window_close - Cerrar ventana
- [ ] desktop.window_list - Listar ventanas
- [ ] desktop.clipboard_get - Obtener clipboard
- [ ] desktop.clipboard_set - Setear clipboard
- [ ] desktop.run_app - Ejecutar aplicación
- [ ] desktop.kill_process - Matar proceso

### Excel
- [ ] excel.open - Abrir workbook
- [ ] excel.create - Crear workbook
- [ ] excel.save - Guardar workbook
- [ ] excel.close - Cerrar workbook
- [ ] excel.read_cell - Leer celda
- [ ] excel.read_range - Leer rango
- [ ] excel.read_sheet - Leer hoja completa
- [ ] excel.write_cell - Escribir celda
- [ ] excel.write_range - Escribir rango
- [ ] excel.append_row - Agregar fila
- [ ] excel.delete_row - Eliminar fila
- [ ] excel.delete_column - Eliminar columna
- [ ] excel.insert_row - Insertar fila
- [ ] excel.insert_column - Insertar columna
- [ ] excel.create_sheet - Crear hoja
- [ ] excel.delete_sheet - Eliminar hoja
- [ ] excel.rename_sheet - Renombrar hoja
- [ ] excel.copy_sheet - Copiar hoja
- [ ] excel.get_sheets - Listar hojas
- [ ] excel.set_format - Aplicar formato
- [ ] excel.set_formula - Insertar fórmula
- [ ] excel.auto_filter - Aplicar filtro
- [ ] excel.sort - Ordenar datos
- [ ] excel.find_replace - Buscar y reemplazar
- [ ] excel.merge_cells - Combinar celdas
- [ ] excel.create_chart - Crear gráfico
- [ ] excel.create_pivot - Crear tabla dinámica
- [ ] excel.export_pdf - Exportar a PDF
- [ ] excel.export_csv - Exportar a CSV

### PDF
- [ ] pdf.read_text - Extraer texto
- [ ] pdf.read_tables - Extraer tablas
- [ ] pdf.read_images - Extraer imágenes
- [ ] pdf.get_pages - Obtener número de páginas
- [ ] pdf.get_metadata - Obtener metadatos
- [ ] pdf.merge - Combinar PDFs
- [ ] pdf.split - Dividir PDF
- [ ] pdf.extract_pages - Extraer páginas
- [ ] pdf.rotate - Rotar páginas
- [ ] pdf.compress - Comprimir PDF
- [ ] pdf.to_images - Convertir a imágenes
- [ ] pdf.from_images - Crear desde imágenes
- [ ] pdf.add_watermark - Agregar marca de agua
- [ ] pdf.encrypt - Encriptar PDF
- [ ] pdf.decrypt - Desencriptar PDF
- [ ] pdf.fill_form - Llenar formulario PDF
- [ ] pdf.sign - Firmar PDF

### Email
- [ ] email.send_smtp - Enviar email SMTP
- [ ] email.send_outlook - Enviar via Outlook
- [ ] email.send_gmail - Enviar via Gmail API
- [ ] email.read_imap - Leer emails IMAP
- [ ] email.read_outlook - Leer desde Outlook
- [ ] email.read_gmail - Leer via Gmail API
- [ ] email.search - Buscar emails
- [ ] email.download_attachments - Descargar adjuntos
- [ ] email.move - Mover email a carpeta
- [ ] email.delete - Eliminar email
- [ ] email.mark_read - Marcar como leído
- [ ] email.mark_unread - Marcar como no leído
- [ ] email.reply - Responder email
- [ ] email.forward - Reenviar email
- [ ] email.create_draft - Crear borrador

### Files & Folders
- [ ] file.read - Leer archivo
- [ ] file.write - Escribir archivo
- [ ] file.append - Agregar a archivo
- [ ] file.copy - Copiar archivo
- [ ] file.move - Mover archivo
- [ ] file.delete - Eliminar archivo
- [ ] file.rename - Renombrar archivo
- [ ] file.exists - Verificar existencia
- [ ] file.get_info - Obtener información
- [ ] file.list - Listar archivos
- [ ] file.search - Buscar archivos
- [ ] file.zip - Comprimir
- [ ] file.unzip - Descomprimir
- [ ] file.checksum - Calcular hash
- [ ] folder.create - Crear carpeta
- [ ] folder.delete - Eliminar carpeta
- [ ] folder.copy - Copiar carpeta
- [ ] folder.move - Mover carpeta

### Data & JSON
- [ ] json.parse - Parsear JSON
- [ ] json.stringify - Convertir a JSON
- [ ] json.get - Obtener valor (JSONPath)
- [ ] json.set - Setear valor
- [ ] json.merge - Combinar objetos
- [ ] json.validate - Validar schema
- [ ] csv.read - Leer CSV
- [ ] csv.write - Escribir CSV
- [ ] csv.to_json - CSV a JSON
- [ ] xml.parse - Parsear XML
- [ ] xml.query - Query XPath
- [ ] xml.to_json - XML a JSON
- [ ] yaml.parse - Parsear YAML
- [ ] yaml.stringify - Convertir a YAML

### API & HTTP
- [ ] http.get - GET request
- [ ] http.post - POST request
- [ ] http.put - PUT request
- [ ] http.patch - PATCH request
- [ ] http.delete - DELETE request
- [ ] http.download - Descargar archivo
- [ ] http.upload - Subir archivo
- [ ] http.graphql - Query GraphQL
- [ ] http.soap - Request SOAP
- [ ] http.oauth2 - Autenticación OAuth2
- [ ] http.retry - Request con retry
- [ ] websocket.connect - Conectar WebSocket
- [ ] websocket.send - Enviar mensaje
- [ ] websocket.receive - Recibir mensaje
- [ ] websocket.close - Cerrar conexión

### Database
- [ ] db.connect - Conectar a BD
- [ ] db.query - Ejecutar query
- [ ] db.insert - Insertar registros
- [ ] db.update - Actualizar registros
- [ ] db.delete - Eliminar registros
- [ ] db.transaction - Ejecutar transacción
- [ ] db.call_procedure - Llamar stored procedure
- [ ] db.bulk_insert - Inserción masiva
- [ ] db.export - Exportar a CSV/Excel

### AI & OCR
- [ ] ai.openai_chat - Chat con GPT
- [ ] ai.openai_complete - Completar texto
- [ ] ai.openai_image - Generar imagen
- [ ] ai.openai_vision - Analizar imagen
- [ ] ai.openai_audio - Transcribir audio
- [ ] ai.claude_chat - Chat con Claude
- [ ] ai.claude_analyze - Analizar documento
- [ ] ai.embedding - Generar embeddings
- [ ] ai.similarity - Calcular similitud
- [ ] ocr.read_image - OCR de imagen
- [ ] ocr.read_pdf - OCR de PDF
- [ ] ocr.read_screen - OCR de pantalla
- [ ] ocr.find_text - Buscar texto en imagen

### Control Flow
- [ ] control.if - Condicional
- [ ] control.switch - Switch/Case
- [ ] control.loop - Loop N veces
- [ ] control.foreach - Iterar lista
- [ ] control.while - While loop
- [ ] control.break - Romper loop
- [ ] control.continue - Continuar loop
- [ ] control.parallel - Ejecutar en paralelo
- [ ] control.wait - Esperar tiempo
- [ ] control.retry - Reintentar en error
- [ ] control.try_catch - Try/Catch
- [ ] control.throw - Lanzar error
- [ ] control.subprocess - Llamar otro bot
- [ ] control.return - Retornar valor

### Variables & Data
- [ ] var.set - Setear variable
- [ ] var.get - Obtener variable
- [ ] var.increment - Incrementar
- [ ] var.decrement - Decrementar
- [ ] var.append - Agregar a lista
- [ ] var.remove - Remover de lista
- [ ] string.concat - Concatenar
- [ ] string.split - Dividir
- [ ] string.replace - Reemplazar
- [ ] string.regex - Regex match/extract
- [ ] string.format - Formatear
- [ ] string.trim - Quitar espacios
- [ ] string.upper - Mayúsculas
- [ ] string.lower - Minúsculas
- [ ] number.calc - Calcular expresión
- [ ] number.round - Redondear
- [ ] number.format - Formatear número
- [ ] date.now - Fecha actual
- [ ] date.format - Formatear fecha
- [ ] date.parse - Parsear fecha
- [ ] date.add - Sumar tiempo
- [ ] date.diff - Diferencia de fechas
- [ ] list.filter - Filtrar lista
- [ ] list.map - Mapear lista
- [ ] list.sort - Ordenar lista
- [ ] list.find - Buscar en lista
- [ ] list.count - Contar elementos
- [ ] list.unique - Valores únicos
- [ ] list.join - Unir como string

### Logging & Debug
- [ ] log.info - Log información
- [ ] log.warning - Log advertencia
- [ ] log.error - Log error
- [ ] log.debug - Log debug
- [ ] log.screenshot - Captura con log
- [ ] debug.breakpoint - Punto de parada
- [ ] debug.assert - Verificar condición
- [ ] debug.dump - Mostrar variable

### Notifications
- [ ] notify.toast - Notificación local
- [ ] notify.email - Enviar notificación email
- [ ] notify.slack - Enviar a Slack
- [ ] notify.teams - Enviar a Teams
- [ ] notify.telegram - Enviar a Telegram
- [ ] notify.webhook - Llamar webhook

### Triggers
- [x] trigger.manual - Ejecución manual
- [x] trigger.form - Formulario de entrada
- [ ] trigger.file_watch - Observar carpeta
- [ ] trigger.email - Al recibir email
- [ ] trigger.webhook - Al recibir webhook
- [ ] trigger.hotkey - Atajo de teclado

---

## FUNCIONES DEL EDITOR

### Edición Básica
- [ ] Undo/Redo con historial ilimitado
- [ ] Copy/Paste nodos (con conexiones)
- [ ] Duplicar nodos (Ctrl+D)
- [ ] Multi-selección (Shift+Click, Ctrl+Click)
- [ ] Selección por área (drag rectangle)
- [ ] Alinear nodos (horizontal/vertical)
- [ ] Distribuir nodos equidistante
- [ ] Snap to grid
- [ ] Auto-layout de flujo

### Navegación
- [ ] Zoom to fit
- [ ] Centrar en nodo seleccionado
- [ ] Minimap navegable
- [ ] Búsqueda de nodos (Ctrl+F)
- [ ] Ir a nodo por ID
- [ ] Breadcrumbs de navegación
- [ ] Historial de posiciones (back/forward)

### Organización Visual
- [ ] Comentarios/Notas en canvas
- [ ] Grupos de nodos (containers)
- [ ] Colores personalizados de nodos
- [ ] Labels en conexiones
- [ ] Ocultar/mostrar nodos
- [ ] Colapsar grupos
- [ ] Capas/layers

### Debugger Visual
- [ ] Breakpoints en nodos
- [ ] Ejecución paso a paso (F10)
- [ ] Step into subproceso (F11)
- [ ] Step out (Shift+F11)
- [ ] Continuar hasta breakpoint (F5)
- [ ] Pausar ejecución
- [ ] Panel de variables en tiempo real
- [ ] Watch expressions
- [ ] Call stack visual
- [ ] Historial de valores por nodo
- [ ] Highlight de nodo activo
- [ ] Logs en tiempo real
- [ ] Time profiling por nodo
- [ ] Modo slow-motion

### Keyboard Shortcuts
- [ ] Ctrl+S - Guardar
- [ ] Ctrl+Z - Undo
- [ ] Ctrl+Y - Redo
- [ ] Ctrl+C - Copiar
- [ ] Ctrl+V - Pegar
- [ ] Ctrl+D - Duplicar
- [ ] Ctrl+A - Seleccionar todo
- [ ] Ctrl+F - Buscar
- [ ] Delete - Eliminar selección
- [ ] Escape - Deseleccionar / Cancelar
- [ ] F5 - Run
- [ ] F10 - Step over
- [ ] F11 - Step into
- [ ] Shift+F11 - Step out
- [ ] F9 - Toggle breakpoint
- [ ] Space - Pan canvas
- [ ] Ctrl+Mouse wheel - Zoom
- [ ] Ctrl+0 - Zoom 100%
- [ ] Ctrl+1 - Zoom to fit

### Validación y Errores
- [ ] Validación en tiempo real
- [ ] Indicador de errores en nodos
- [ ] Panel de problemas
- [ ] Sugerencias de corrección
- [ ] Validar antes de ejecutar
- [ ] Detectar loops infinitos
- [ ] Detectar nodos sin conectar

### Versionado
- [ ] Historial de cambios local
- [ ] Comparar versiones (diff visual)
- [ ] Rollback a versión anterior
- [ ] Nombrar versiones
- [ ] Auto-backup periódico

### Templates y Snippets
- [ ] Guardar selección como snippet
- [ ] Biblioteca de snippets
- [ ] Templates de bots predefinidos
- [ ] Crear bot desde template
- [ ] Compartir templates

### Colaboración (futuro)
- [ ] Edición colaborativa en tiempo real
- [ ] Comentarios y revisiones
- [ ] Asignación de tareas
- [ ] Notificaciones de cambios

### Import/Export
- [ ] Exportar bot como JSON
- [ ] Importar bot desde JSON
- [ ] Exportar como imagen (PNG/SVG)
- [ ] Exportar documentación
- [ ] Exportar a código Python

### UI/UX
- [ ] Tema oscuro/claro
- [ ] Personalizar colores de categorías
- [ ] Paneles redimensionables
- [ ] Layouts guardados
- [ ] Modo zen (solo canvas)
- [ ] Tooltips contextuales
- [ ] Tours/onboarding interactivo

---

## PRIORIDADES DE IMPLEMENTACIÓN

### Inmediato (Sprint 1)
1. Undo/Redo
2. Copy/Paste/Duplicar
3. Keyboard shortcuts básicos
4. Validación en tiempo real

### Corto plazo (Sprint 2-3)
1. Debugger visual básico (breakpoints, step)
2. Nodos de Excel (operaciones principales)
3. Nodos de Email (enviar/leer)
4. Búsqueda de nodos

### Mediano plazo (Sprint 4-6)
1. Nodos de PDF
2. Nodos de Database
3. Control flow avanzado (loops, parallel)
4. Comentarios y grupos
5. Templates y snippets

### Largo plazo
1. Nodos de IA
2. Versionado completo
3. Import/Export avanzado
4. Temas y personalización
