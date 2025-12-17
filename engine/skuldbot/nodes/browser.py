"""
Librería de nodos Browser (Robot Framework)
"""

from robot.api.deco import keyword, library
from RPA.Browser.Selenium import Selenium


@library(scope="GLOBAL", auto_keywords=True)
class BrowserLibrary:
    """
    Librería custom de browser para Skuldbot
    Extiende RPA.Browser.Selenium con funcionalidades adicionales
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self.selenium = Selenium()
        self._browser_opened = False

    @keyword("Open Browser With Config")
    def open_browser_with_config(self, config: dict):
        """
        Abre un browser con configuración del nodo

        Args:
            config: Diccionario con url, browser, headless, etc.

        Example:
            | Open Browser With Config | ${config} |
        """
        url = config.get("url", "about:blank")
        browser = config.get("browser", "chromium")
        headless = config.get("headless", False)

        self.selenium.open_available_browser(url, browser=browser, headless=headless)
        self._browser_opened = True

    @keyword("Click Element With Retry")
    def click_element_with_retry(self, selector: str, retries: int = 3):
        """
        Hace click con retry automático

        Args:
            selector: Selector CSS/XPath
            retries: Número de reintentos

        Example:
            | Click Element With Retry | css:#submit-btn | 3 |
        """
        for attempt in range(retries):
            try:
                self.selenium.click_element(selector)
                return
            except Exception as e:
                if attempt == retries - 1:
                    raise
                self.selenium.sleep("1s")

    @keyword("Fill Form Field")
    def fill_form_field(self, selector: str, value: str, clear: bool = True):
        """
        Llena un campo de formulario

        Args:
            selector: Selector del campo
            value: Valor a ingresar
            clear: Si debe limpiar el campo primero

        Example:
            | Fill Form Field | css:#username | admin | True |
        """
        if clear:
            self.selenium.clear_element_text(selector)
        self.selenium.input_text(selector, value)

    @keyword("Wait For Element And Click")
    def wait_for_element_and_click(self, selector: str, timeout: str = "10s"):
        """
        Espera a que aparezca un elemento y hace click

        Args:
            selector: Selector del elemento
            timeout: Timeout de espera

        Example:
            | Wait For Element And Click | css:#dynamic-button | 15s |
        """
        self.selenium.wait_until_element_is_visible(selector, timeout=timeout)
        self.selenium.click_element(selector)

    @keyword("Take Screenshot On Error")
    def take_screenshot_on_error(self, node_id: str):
        """
        Toma screenshot cuando hay error (para debugging)

        Args:
            node_id: ID del nodo que falló

        Example:
            | Take Screenshot On Error | node-123 |
        """
        filename = f"error_{node_id}_{int(time.time())}.png"
        self.selenium.screenshot(filename=filename)
        return filename

    @keyword("Close Browser Safe")
    def close_browser_safe(self):
        """
        Cierra el browser de forma segura

        Example:
            | Close Browser Safe |
        """
        if self._browser_opened:
            try:
                self.selenium.close_browser()
            except Exception:
                pass
            finally:
                self._browser_opened = False

