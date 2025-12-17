#!/usr/bin/env python3
"""
Servidor Mock de Formularios para Testing

Este servidor simula el comportamiento del Form Service del Orchestrator,
permitiendo probar el flujo completo de Form Trigger sin necesidad de
tener el Orchestrator implementado.

Uso:
    python tools/form_server.py [--port 8080] [--form-config config.json]

Endpoints:
    GET  /                  - Lista de formularios disponibles
    GET  /forms/:id         - Renderiza el formulario HTML
    POST /forms/:id/submit  - Procesa el envío del formulario
    GET  /api/forms/:id     - Obtiene la definición JSON del formulario
"""

import json
import argparse
import sys
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from datetime import datetime
import uuid

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from skuldbot.libs.forms import SkuldForms

# Default test form configuration
DEFAULT_FORM = {
    "id": "test-form-001",
    "title": "Formulario de Prueba - Skuldbot",
    "description": "Este es un formulario de prueba para validar el flujo del Form Trigger",
    "fields": [
        {
            "id": "nombre",
            "type": "text",
            "label": "Nombre Completo",
            "placeholder": "Ej: Juan Pérez",
            "required": True
        },
        {
            "id": "email",
            "type": "email",
            "label": "Correo Electrónico",
            "placeholder": "tu@email.com",
            "required": True
        },
        {
            "id": "edad",
            "type": "number",
            "label": "Edad",
            "placeholder": "25",
            "required": False,
            "validation": {
                "min": 18,
                "max": 120
            }
        },
        {
            "id": "fecha_nacimiento",
            "type": "date",
            "label": "Fecha de Nacimiento",
            "required": False
        },
        {
            "id": "departamento",
            "type": "dropdown",
            "label": "Departamento",
            "required": True,
            "options": ["Ventas", "Marketing", "Desarrollo", "RRHH", "Finanzas"]
        },
        {
            "id": "comentarios",
            "type": "textarea",
            "label": "Comentarios Adicionales",
            "placeholder": "Escribe tus comentarios aquí...",
            "required": False
        },
        {
            "id": "acepta_terminos",
            "type": "checkbox",
            "label": "Acepto los términos y condiciones",
            "required": True
        }
    ],
    "submitButtonLabel": "Enviar Formulario",
    "successMessage": "¡Gracias! Tu formulario ha sido recibido correctamente."
}

# Store submissions in memory
submissions = []


class FormServerHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler for Form Server"""

    forms = SkuldForms()
    form_config = DEFAULT_FORM

    def _set_headers(self, status=200, content_type="text/html"):
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _send_json(self, data, status=200):
        self._set_headers(status, "application/json")
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def _send_html(self, html, status=200):
        self._set_headers(status, "text/html")
        self.wfile.write(html.encode("utf-8"))

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self._set_headers(200)

    def do_GET(self):
        """Handle GET requests"""
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "":
            self._handle_index()
        elif path.startswith("/forms/") and not path.endswith("/submit"):
            form_id = path.replace("/forms/", "").split("/")[0]
            self._handle_form_html(form_id)
        elif path.startswith("/api/forms/"):
            form_id = path.replace("/api/forms/", "").split("/")[0]
            self._handle_form_api(form_id)
        elif path == "/submissions":
            self._handle_submissions_list()
        else:
            self._send_html("<h1>404 - Not Found</h1>", 404)

    def do_POST(self):
        """Handle POST requests"""
        parsed = urlparse(self.path)
        path = parsed.path

        if path.endswith("/submit"):
            form_id = path.replace("/forms/", "").replace("/submit", "")
            self._handle_form_submit(form_id)
        else:
            self._send_json({"error": "Not Found"}, 404)

    def _handle_index(self):
        """Render index page with available forms"""
        html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Skuldbot Form Server - Testing</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen">
    <div class="container mx-auto px-4 py-12">
        <div class="max-w-2xl mx-auto">
            <!-- Header -->
            <div class="text-center mb-12">
                <div class="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl mb-4">
                    <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <h1 class="text-3xl font-bold text-white mb-2">Skuldbot Form Server</h1>
                <p class="text-slate-400">Servidor de pruebas para Form Trigger</p>
            </div>

            <!-- Available Forms -->
            <div class="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8">
                <h2 class="text-lg font-semibold text-white mb-4">Formularios Disponibles</h2>
                <a href="/forms/{self.form_config['id']}"
                   class="block p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors border border-white/10">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                            <svg class="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-white font-medium">{self.form_config['title']}</h3>
                            <p class="text-slate-400 text-sm">{self.form_config['description']}</p>
                        </div>
                        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                </a>
            </div>

            <!-- API Endpoints -->
            <div class="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8">
                <h2 class="text-lg font-semibold text-white mb-4">API Endpoints</h2>
                <div class="space-y-3 font-mono text-sm">
                    <div class="flex items-center gap-3">
                        <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">GET</span>
                        <span class="text-slate-300">/forms/:id</span>
                        <span class="text-slate-500">- Formulario HTML</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">POST</span>
                        <span class="text-slate-300">/forms/:id/submit</span>
                        <span class="text-slate-500">- Enviar formulario</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">GET</span>
                        <span class="text-slate-300">/api/forms/:id</span>
                        <span class="text-slate-500">- Definición JSON</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">GET</span>
                        <span class="text-slate-300">/submissions</span>
                        <span class="text-slate-500">- Ver envíos ({len(submissions)})</span>
                    </div>
                </div>
            </div>

            <!-- Submissions Count -->
            <div class="text-center">
                <a href="/submissions" class="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors">
                    <span>Ver {len(submissions)} envíos recibidos</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                    </svg>
                </a>
            </div>
        </div>
    </div>
</body>
</html>"""
        self._send_html(html)

    def _handle_form_html(self, form_id: str):
        """Render form HTML"""
        if form_id != self.form_config["id"]:
            self._send_html("<h1>404 - Form not found</h1>", 404)
            return

        # Use SkuldForms to generate HTML
        html = self.forms.generate_form_html(
            form_definition=self.form_config,
            action_url=f"/forms/{form_id}/submit",
            method="POST",
            css_framework="tailwind"
        )
        self._send_html(html)

    def _handle_form_api(self, form_id: str):
        """Return form definition as JSON"""
        if form_id != self.form_config["id"]:
            self._send_json({"error": "Form not found"}, 404)
            return

        self._send_json(self.form_config)

    def _handle_form_submit(self, form_id: str):
        """Process form submission"""
        if form_id != self.form_config["id"]:
            self._send_json({"error": "Form not found"}, 404)
            return

        # Read request body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")

        # Parse form data (handle both JSON and form-urlencoded)
        try:
            if self.headers.get("Content-Type", "").startswith("application/json"):
                data = json.loads(body)
            else:
                # Parse form-urlencoded
                parsed = parse_qs(body)
                data = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
        except Exception as e:
            self._send_json({"success": False, "error": f"Invalid data: {str(e)}"}, 400)
            return

        # Validate form data
        validation_result = self.forms.validate_form_data(self.form_config, data)

        if not validation_result["valid"]:
            # Return validation errors as HTML for better UX
            errors_html = self._render_error_page(validation_result["errors"])
            self._send_html(errors_html, 400)
            return

        # Process submission
        processed = self.forms.process_form_submission(self.form_config, data)

        # Store submission
        submission = {
            "id": str(uuid.uuid4()),
            "form_id": form_id,
            "data": processed,
            "raw_data": data,
            "timestamp": datetime.now().isoformat(),
            "ip": self.client_address[0]
        }
        submissions.append(submission)

        # Log to console
        print(f"\n{'='*60}")
        print(f"📥 FORM SUBMISSION RECEIVED")
        print(f"{'='*60}")
        print(f"Form ID: {form_id}")
        print(f"Time: {submission['timestamp']}")
        print(f"Data:")
        for key, value in processed.items():
            print(f"  • {key}: {value}")
        print(f"{'='*60}\n")

        # Return success page
        success_html = self._render_success_page(submission)
        self._send_html(success_html)

    def _handle_submissions_list(self):
        """Show list of submissions"""
        html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Envíos Recibidos - Skuldbot</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen">
    <div class="container mx-auto px-4 py-12">
        <div class="max-w-4xl mx-auto">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h1 class="text-2xl font-bold text-white">Envíos Recibidos</h1>
                    <p class="text-slate-400">{len(submissions)} formularios procesados</p>
                </div>
                <a href="/" class="text-emerald-400 hover:text-emerald-300">← Volver</a>
            </div>

            <div class="space-y-4">
"""

        if not submissions:
            html += """
                <div class="bg-white/10 rounded-xl p-8 text-center">
                    <p class="text-slate-400">No hay envíos aún. Prueba el formulario primero.</p>
                </div>
"""
        else:
            for sub in reversed(submissions):
                html += f"""
                <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-xs font-mono text-slate-400">{sub['id'][:8]}...</span>
                        <span class="text-xs text-slate-500">{sub['timestamp']}</span>
                    </div>
                    <div class="space-y-2">
"""
                for key, value in sub['data'].items():
                    html += f"""
                        <div class="flex items-center gap-2">
                            <span class="text-slate-400 text-sm">{key}:</span>
                            <span class="text-white text-sm">{value}</span>
                        </div>
"""
                html += """
                    </div>
                </div>
"""

        html += """
            </div>
        </div>
    </div>
</body>
</html>"""
        self._send_html(html)

    def _render_success_page(self, submission: dict) -> str:
        """Render success page after submission"""
        return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enviado - {self.form_config['title']}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-emerald-900 to-slate-900 min-h-screen flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
        </div>

        <h1 class="text-2xl font-bold text-slate-800 mb-2">¡Enviado!</h1>
        <p class="text-slate-600 mb-6">{self.form_config.get('successMessage', 'Tu formulario ha sido recibido.')}</p>

        <div class="bg-slate-50 rounded-lg p-4 mb-6 text-left">
            <p class="text-xs text-slate-500 mb-2">ID de Referencia:</p>
            <p class="font-mono text-sm text-slate-700">{submission['id']}</p>
        </div>

        <div class="space-y-3">
            <a href="/forms/{self.form_config['id']}"
               class="block w-full py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                Enviar otro formulario
            </a>
            <a href="/" class="block w-full py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                Volver al inicio
            </a>
        </div>
    </div>
</body>
</html>"""

    def _render_error_page(self, errors: list) -> str:
        """Render error page for validation failures"""
        errors_html = ""
        for error in errors:
            errors_html += f"""
                <li class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                    <span><strong>{error['field']}:</strong> {error['message']}</span>
                </li>
"""

        return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - {self.form_config['title']}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-red-900 to-slate-900 min-h-screen flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
        </div>

        <h1 class="text-2xl font-bold text-slate-800 mb-2 text-center">Error de Validación</h1>
        <p class="text-slate-600 mb-6 text-center">Por favor corrige los siguientes errores:</p>

        <ul class="space-y-2 text-sm text-slate-700 mb-6">
            {errors_html}
        </ul>

        <a href="/forms/{self.form_config['id']}"
           class="block w-full py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-center">
            Volver al formulario
        </a>
    </div>
</body>
</html>"""

    def log_message(self, format, *args):
        """Custom log format"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def main():
    parser = argparse.ArgumentParser(description="Skuldbot Form Server - Testing")
    parser.add_argument("--port", type=int, default=8080, help="Puerto del servidor (default: 8080)")
    parser.add_argument("--form-config", type=str, help="Archivo JSON con configuración del formulario")
    args = parser.parse_args()

    # Load custom form config if provided
    if args.form_config:
        config_path = Path(args.form_config)
        if config_path.exists():
            with open(config_path) as f:
                FormServerHandler.form_config = json.load(f)
            print(f"✓ Configuración cargada desde: {args.form_config}")
        else:
            print(f"⚠ Archivo no encontrado: {args.form_config}, usando configuración por defecto")

    # Start server
    server = HTTPServer(("", args.port), FormServerHandler)

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🤖 Skuldbot Form Server - Testing                          ║
║                                                              ║
║   Servidor corriendo en: http://localhost:{args.port:<5}              ║
║                                                              ║
║   Endpoints:                                                 ║
║   • GET  /                    - Página principal             ║
║   • GET  /forms/:id           - Ver formulario               ║
║   • POST /forms/:id/submit    - Enviar formulario            ║
║   • GET  /api/forms/:id       - API JSON                     ║
║   • GET  /submissions         - Ver envíos                   ║
║                                                              ║
║   Presiona Ctrl+C para detener                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Servidor detenido")
        server.shutdown()


if __name__ == "__main__":
    main()
