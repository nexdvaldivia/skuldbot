# Contribuir a Skuldbot Engine

¡Gracias por tu interés en contribuir a Skuldbot Engine!

## Proceso de Contribución

1. **Fork** el repositorio
2. **Crea** una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. **Push** a la rama (`git push origin feature/AmazingFeature`)
5. **Abre** un Pull Request

## Guías de Código

### Python Style

- Seguimos [PEP 8](https://pep8.org/)
- Usamos `black` para formateo automático
- Usamos `ruff` para linting
- Type hints obligatorios en funciones públicas

### Tests

- Tests obligatorios para nuevo código
- Cobertura mínima: 80%
- Usar fixtures de pytest cuando sea posible

### Commits

Formato de commits:

```
tipo(scope): descripción corta

Descripción más detallada si es necesaria.
```

Tipos:
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `docs`: Cambios en documentación
- `test`: Agregar/modificar tests
- `refactor`: Refactorización
- `chore`: Tareas de mantenimiento

## Setup de Desarrollo

```bash
# Clonar
git clone https://github.com/khipus/skuldbot-engine
cd skuldbot-engine

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Instalar en modo desarrollo
pip install -e ".[dev]"

# Correr tests
pytest

# Formatear código
black skuldbot tests
ruff check skuldbot tests --fix
```

## Reportar Bugs

Usa los GitHub Issues e incluye:
- Descripción del problema
- Steps to reproduce
- Comportamiento esperado vs actual
- Versión de Python y skuldbot-engine
- Stack trace si aplica

## Proponer Features

Abre un Issue con:
- Descripción del feature
- Casos de uso
- Propuesta de API/interfaz
- Alternativas consideradas

## Preguntas

Para preguntas, usa:
- GitHub Discussions
- Canal de Discord (próximamente)

¡Gracias por contribuir! 🎉

