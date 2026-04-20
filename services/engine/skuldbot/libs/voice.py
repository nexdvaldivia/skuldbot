"""
Librería SkuldVoice para automatización de voz y telefonía (Robot Framework)

Proporciona keywords para:
- Llamadas telefónicas entrantes/salientes (Twilio)
- Speech-to-Text (Azure Speech Services)
- Text-to-Speech (Azure Speech Services)
- Conversaciones LLM-powered
- Grabación y transcripción

Esta library es genérica y puede usarse para cualquier caso de uso:
- Contact centers
- IVR inteligente
- Encuestas telefónicas
- Notificaciones de voz
- Asistentes virtuales

Providers soportados:
- Twilio (telefonía)
- Azure Speech Services (STT/TTS)
- Google Speech (futuro)
- AWS Transcribe/Polly (futuro)
"""

import json
import time
import uuid
import base64
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from robot.api.deco import keyword, library
from robot.api import logger


class VoiceProvider(Enum):
    """Proveedores de telefonía soportados"""
    TWILIO = "twilio"
    VONAGE = "vonage"  # Futuro
    CUSTOM = "custom"


class SpeechProvider(Enum):
    """Proveedores de STT/TTS soportados"""
    AZURE = "azure"
    GOOGLE = "google"  # Futuro
    AWS = "aws"  # Futuro
    OPENAI = "openai"  # Whisper


class CallStatus(Enum):
    """Estados de una llamada"""
    QUEUED = "queued"
    RINGING = "ringing"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    BUSY = "busy"
    FAILED = "failed"
    NO_ANSWER = "no-answer"
    CANCELED = "canceled"


@dataclass
class CallInfo:
    """Información de una llamada"""
    call_sid: str
    from_number: str
    to_number: str
    status: CallStatus
    direction: str  # inbound/outbound
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: int = 0
    recording_url: Optional[str] = None
    transcript: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversationTurn:
    """Un turno en la conversación"""
    role: str  # "caller" o "agent"
    text: str
    timestamp: datetime
    confidence: float = 1.0
    audio_url: Optional[str] = None


@dataclass
class VoiceConfig:
    """Configuración del proveedor de voz"""
    # Twilio
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None

    # Azure Speech
    azure_speech_key: Optional[str] = None
    azure_speech_region: str = "eastus"
    azure_stt_language: str = "en-US"
    azure_tts_voice: str = "en-US-JennyNeural"
    azure_tts_style: str = "customerservice"

    # General
    recording_enabled: bool = True
    transcription_enabled: bool = True


@library(scope="GLOBAL", auto_keywords=True)
class SkuldVoice:
    """
    Librería de Voz y Telefonía para Skuldbot.

    Proporciona keywords para:
    - Gestión de llamadas (Twilio)
    - Speech-to-Text (Azure/OpenAI)
    - Text-to-Speech (Azure)
    - Conversaciones interactivas
    - Grabación y transcripción

    Esta library es BYOC (Bring Your Own Credentials):
    El usuario debe proporcionar sus propias credenciales de Twilio y Azure.
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._config: Optional[VoiceConfig] = None
        self._twilio_client: Any = None
        self._azure_speech_config: Any = None
        self._current_call: Optional[CallInfo] = None
        self._conversation_history: List[ConversationTurn] = []
        self._call_context: Dict[str, Any] = {}

    # =========================================================================
    # CONFIGURACIÓN
    # =========================================================================

    @keyword("Configure Voice Provider")
    def configure_voice_provider(
        self,
        twilio_account_sid: Optional[str] = None,
        twilio_auth_token: Optional[str] = None,
        twilio_phone_number: Optional[str] = None,
        azure_speech_key: Optional[str] = None,
        azure_speech_region: str = "eastus",
        azure_stt_language: str = "en-US",
        azure_tts_voice: str = "en-US-JennyNeural",
        recording_enabled: bool = True,
        transcription_enabled: bool = True,
    ):
        """
        Configura los proveedores de voz (Twilio y Azure Speech).

        Args:
            twilio_account_sid: Twilio Account SID
            twilio_auth_token: Twilio Auth Token
            twilio_phone_number: Número de teléfono Twilio
            azure_speech_key: Azure Speech Services Key
            azure_speech_region: Región de Azure (default: eastus)
            azure_stt_language: Idioma para STT (default: en-US)
            azure_tts_voice: Voz para TTS (default: en-US-JennyNeural)
            recording_enabled: Habilitar grabación de llamadas
            transcription_enabled: Habilitar transcripción automática

        Example:
            | Configure Voice Provider | ${TWILIO_SID} | ${TWILIO_TOKEN} | +1234567890 |
            | ...                      | azure_speech_key=${AZURE_KEY} |
        """
        self._config = VoiceConfig(
            twilio_account_sid=twilio_account_sid,
            twilio_auth_token=twilio_auth_token,
            twilio_phone_number=twilio_phone_number,
            azure_speech_key=azure_speech_key,
            azure_speech_region=azure_speech_region,
            azure_stt_language=azure_stt_language,
            azure_tts_voice=azure_tts_voice,
            recording_enabled=recording_enabled,
            transcription_enabled=transcription_enabled,
        )

        # Inicializar Twilio si hay credenciales
        if twilio_account_sid and twilio_auth_token:
            self._init_twilio()

        # Inicializar Azure Speech si hay credenciales
        if azure_speech_key:
            self._init_azure_speech()

        logger.info("Voice provider configured successfully")

    def _init_twilio(self):
        """Inicializa el cliente de Twilio"""
        try:
            from twilio.rest import Client
            self._twilio_client = Client(
                self._config.twilio_account_sid,
                self._config.twilio_auth_token
            )
            logger.info("Twilio client initialized")
        except ImportError:
            logger.warn("twilio package not installed. Install with: pip install twilio")
            self._twilio_client = None

    def _init_azure_speech(self):
        """Inicializa Azure Speech Services"""
        try:
            import azure.cognitiveservices.speech as speechsdk
            self._azure_speech_config = speechsdk.SpeechConfig(
                subscription=self._config.azure_speech_key,
                region=self._config.azure_speech_region
            )
            self._azure_speech_config.speech_recognition_language = self._config.azure_stt_language
            self._azure_speech_config.speech_synthesis_voice_name = self._config.azure_tts_voice
            logger.info("Azure Speech Services initialized")
        except ImportError:
            logger.warn("azure-cognitiveservices-speech not installed. Install with: pip install azure-cognitiveservices-speech")
            self._azure_speech_config = None

    # =========================================================================
    # LLAMADAS TELEFÓNICAS
    # =========================================================================

    @keyword("Make Outbound Call")
    def make_outbound_call(
        self,
        to_number: str,
        twiml_url: Optional[str] = None,
        twiml: Optional[str] = None,
        status_callback: Optional[str] = None,
        record: bool = True,
        timeout: int = 30,
    ) -> Dict[str, Any]:
        """
        Realiza una llamada saliente usando Twilio.

        Args:
            to_number: Número de destino (formato E.164: +1234567890)
            twiml_url: URL que retorna TwiML para la llamada
            twiml: TwiML inline (si no se usa twiml_url)
            status_callback: URL para recibir actualizaciones de estado
            record: Si grabar la llamada
            timeout: Timeout en segundos

        Returns:
            Diccionario con información de la llamada

        Example:
            | ${call}= | Make Outbound Call | +1234567890 | twiml_url=https://myapp.com/voice |
            | Log | Call SID: ${call}[call_sid] |
        """
        self._ensure_twilio_configured()

        call_params = {
            "to": to_number,
            "from_": self._config.twilio_phone_number,
            "timeout": timeout,
        }

        if twiml_url:
            call_params["url"] = twiml_url
        elif twiml:
            call_params["twiml"] = twiml
        else:
            # TwiML básico que reproduce un mensaje
            call_params["twiml"] = "<Response><Say>Hello, this is an automated call from Skuldbot.</Say></Response>"

        if status_callback:
            call_params["status_callback"] = status_callback
            call_params["status_callback_event"] = ["initiated", "ringing", "answered", "completed"]

        if record and self._config.recording_enabled:
            call_params["record"] = True

        try:
            call = self._twilio_client.calls.create(**call_params)

            self._current_call = CallInfo(
                call_sid=call.sid,
                from_number=self._config.twilio_phone_number,
                to_number=to_number,
                status=CallStatus(call.status),
                direction="outbound",
                start_time=datetime.now(),
            )

            logger.info(f"Outbound call initiated: {call.sid}")

            return {
                "call_sid": call.sid,
                "status": call.status,
                "from": self._config.twilio_phone_number,
                "to": to_number,
                "direction": "outbound",
            }

        except Exception as e:
            logger.error(f"Failed to make outbound call: {e}")
            return {"error": str(e), "status": "failed"}

    @keyword("Handle Incoming Call")
    def handle_incoming_call(
        self,
        call_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Procesa una llamada entrante (webhook de Twilio).

        Este keyword se usa dentro de un bot que actúa como webhook.
        El bot recibe los datos de la llamada desde Twilio.

        Args:
            call_data: Datos del webhook de Twilio (CallSid, From, To, etc.)

        Returns:
            Información de la llamada procesada

        Example:
            | ${call_info}= | Handle Incoming Call | ${webhook_data} |
            | Log | Incoming call from: ${call_info}[from_number] |
        """
        call_sid = call_data.get("CallSid", call_data.get("call_sid", ""))
        from_number = call_data.get("From", call_data.get("from", ""))
        to_number = call_data.get("To", call_data.get("to", ""))

        self._current_call = CallInfo(
            call_sid=call_sid,
            from_number=from_number,
            to_number=to_number,
            status=CallStatus.IN_PROGRESS,
            direction="inbound",
            start_time=datetime.now(),
        )

        # Limpiar historial de conversación para nueva llamada
        self._conversation_history = []

        logger.info(f"Incoming call handled: {call_sid} from {from_number}")

        return {
            "call_sid": call_sid,
            "from_number": from_number,
            "to_number": to_number,
            "direction": "inbound",
            "status": "in-progress",
        }

    @keyword("Get Call Status")
    def get_call_status(
        self,
        call_sid: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Obtiene el estado actual de una llamada.

        Args:
            call_sid: SID de la llamada (usa la actual si no se especifica)

        Returns:
            Estado de la llamada

        Example:
            | ${status}= | Get Call Status |
            | Should Be Equal | ${status}[status] | in-progress |
        """
        self._ensure_twilio_configured()

        sid = call_sid or (self._current_call.call_sid if self._current_call else None)
        if not sid:
            return {"error": "No call SID specified and no current call"}

        try:
            call = self._twilio_client.calls(sid).fetch()

            return {
                "call_sid": call.sid,
                "status": call.status,
                "duration": call.duration,
                "direction": call.direction,
                "from": call.from_formatted,
                "to": call.to_formatted,
            }
        except Exception as e:
            logger.error(f"Failed to get call status: {e}")
            return {"error": str(e)}

    @keyword("End Call")
    def end_call(
        self,
        call_sid: Optional[str] = None,
        farewell_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Termina una llamada en curso.

        Args:
            call_sid: SID de la llamada (usa la actual si no se especifica)
            farewell_message: Mensaje de despedida opcional

        Returns:
            Estado final de la llamada

        Example:
            | ${result}= | End Call | farewell_message=Thank you for calling. Goodbye! |
        """
        self._ensure_twilio_configured()

        sid = call_sid or (self._current_call.call_sid if self._current_call else None)
        if not sid:
            return {"error": "No call SID specified and no current call"}

        try:
            # Si hay mensaje de despedida, actualizamos la llamada con TwiML
            if farewell_message:
                twiml = f"<Response><Say>{farewell_message}</Say><Hangup/></Response>"
                call = self._twilio_client.calls(sid).update(twiml=twiml)
            else:
                call = self._twilio_client.calls(sid).update(status="completed")

            if self._current_call and self._current_call.call_sid == sid:
                self._current_call.status = CallStatus.COMPLETED
                self._current_call.end_time = datetime.now()

            logger.info(f"Call ended: {sid}")

            return {
                "call_sid": sid,
                "status": "completed",
                "conversation_turns": len(self._conversation_history),
            }

        except Exception as e:
            logger.error(f"Failed to end call: {e}")
            return {"error": str(e)}

    @keyword("Transfer Call")
    def transfer_call(
        self,
        transfer_to: str,
        call_sid: Optional[str] = None,
        announce_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transfiere una llamada a otro número o agente.

        Args:
            transfer_to: Número o SIP URI de destino
            call_sid: SID de la llamada (usa la actual si no se especifica)
            announce_message: Mensaje antes de transferir

        Returns:
            Resultado de la transferencia

        Example:
            | ${result}= | Transfer Call | +1987654321 | announce_message=Transferring you now |
        """
        self._ensure_twilio_configured()

        sid = call_sid or (self._current_call.call_sid if self._current_call else None)
        if not sid:
            return {"error": "No call SID specified and no current call"}

        try:
            # Construir TwiML para la transferencia
            twiml_parts = ["<Response>"]

            if announce_message:
                twiml_parts.append(f"<Say>{announce_message}</Say>")

            twiml_parts.append(f"<Dial>{transfer_to}</Dial>")
            twiml_parts.append("</Response>")

            twiml = "".join(twiml_parts)

            call = self._twilio_client.calls(sid).update(twiml=twiml)

            logger.info(f"Call {sid} transferred to {transfer_to}")

            return {
                "call_sid": sid,
                "transferred_to": transfer_to,
                "status": "transferred",
            }

        except Exception as e:
            logger.error(f"Failed to transfer call: {e}")
            return {"error": str(e)}

    # =========================================================================
    # SPEECH-TO-TEXT (STT)
    # =========================================================================

    @keyword("Transcribe Audio File")
    def transcribe_audio_file(
        self,
        audio_path: str,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transcribe un archivo de audio a texto.

        Args:
            audio_path: Ruta al archivo de audio (WAV, MP3, etc.)
            language: Idioma del audio (default: configurado)

        Returns:
            Transcripción y metadata

        Example:
            | ${result}= | Transcribe Audio File | /path/to/audio.wav |
            | Log | Transcript: ${result}[text] |
        """
        self._ensure_azure_configured()

        try:
            import azure.cognitiveservices.speech as speechsdk

            audio_config = speechsdk.AudioConfig(filename=audio_path)

            speech_config = speechsdk.SpeechConfig(
                subscription=self._config.azure_speech_key,
                region=self._config.azure_speech_region
            )
            speech_config.speech_recognition_language = language or self._config.azure_stt_language

            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config
            )

            result = recognizer.recognize_once()

            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                return {
                    "text": result.text,
                    "confidence": 1.0,  # Azure no da confidence en recognize_once
                    "language": language or self._config.azure_stt_language,
                    "status": "success",
                }
            elif result.reason == speechsdk.ResultReason.NoMatch:
                return {
                    "text": "",
                    "status": "no_match",
                    "error": "Speech could not be recognized",
                }
            else:
                return {
                    "text": "",
                    "status": "error",
                    "error": f"Recognition failed: {result.reason}",
                }

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return {"text": "", "status": "error", "error": str(e)}

    @keyword("Transcribe Audio Stream")
    def transcribe_audio_stream(
        self,
        audio_data: bytes,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transcribe audio en tiempo real desde bytes.

        Args:
            audio_data: Bytes de audio (PCM 16kHz 16-bit mono)
            language: Idioma del audio

        Returns:
            Transcripción

        Example:
            | ${result}= | Transcribe Audio Stream | ${audio_bytes} |
        """
        self._ensure_azure_configured()

        try:
            import azure.cognitiveservices.speech as speechsdk

            # Crear stream de audio desde bytes
            stream = speechsdk.AudioInputStream(
                stream_format=speechsdk.audio.AudioStreamFormat(
                    samples_per_second=16000,
                    bits_per_sample=16,
                    channels=1
                )
            )
            stream.write(audio_data)
            stream.close()

            audio_config = speechsdk.AudioConfig(stream=stream)

            speech_config = speechsdk.SpeechConfig(
                subscription=self._config.azure_speech_key,
                region=self._config.azure_speech_region
            )
            speech_config.speech_recognition_language = language or self._config.azure_stt_language

            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config
            )

            result = recognizer.recognize_once()

            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                return {
                    "text": result.text,
                    "status": "success",
                }
            else:
                return {
                    "text": "",
                    "status": "no_speech",
                }

        except Exception as e:
            logger.error(f"Stream transcription failed: {e}")
            return {"text": "", "status": "error", "error": str(e)}

    # =========================================================================
    # TEXT-TO-SPEECH (TTS)
    # =========================================================================

    @keyword("Synthesize Speech")
    def synthesize_speech(
        self,
        text: str,
        output_path: Optional[str] = None,
        voice: Optional[str] = None,
        style: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Convierte texto a audio usando Azure Speech.

        Args:
            text: Texto a sintetizar
            output_path: Ruta para guardar el audio (opcional)
            voice: Voz a usar (default: configurada)
            style: Estilo de voz (cheerful, sad, angry, customerservice, etc.)

        Returns:
            Audio data y metadata

        Example:
            | ${result}= | Synthesize Speech | Hello, how can I help you? |
            | ${result}= | Synthesize Speech | Welcome! | output_path=/tmp/welcome.wav |
        """
        self._ensure_azure_configured()

        try:
            import azure.cognitiveservices.speech as speechsdk

            speech_config = speechsdk.SpeechConfig(
                subscription=self._config.azure_speech_key,
                region=self._config.azure_speech_region
            )

            voice_name = voice or self._config.azure_tts_voice
            speech_config.speech_synthesis_voice_name = voice_name

            # Configurar salida
            if output_path:
                audio_config = speechsdk.AudioConfig(filename=output_path)
            else:
                audio_config = None  # Retorna bytes

            synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=speech_config,
                audio_config=audio_config
            )

            # Usar SSML si hay estilo
            if style:
                ssml = f"""
                <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
                       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
                    <voice name="{voice_name}">
                        <mstts:express-as style="{style}">
                            {text}
                        </mstts:express-as>
                    </voice>
                </speak>
                """
                result = synthesizer.speak_ssml(ssml)
            else:
                result = synthesizer.speak_text(text)

            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                response = {
                    "status": "success",
                    "voice": voice_name,
                    "text_length": len(text),
                }

                if output_path:
                    response["output_path"] = output_path
                else:
                    response["audio_data"] = base64.b64encode(result.audio_data).decode()
                    response["audio_length_bytes"] = len(result.audio_data)

                return response
            else:
                return {
                    "status": "error",
                    "error": f"Synthesis failed: {result.reason}",
                }

        except Exception as e:
            logger.error(f"Speech synthesis failed: {e}")
            return {"status": "error", "error": str(e)}

    @keyword("Generate TwiML Say")
    def generate_twiml_say(
        self,
        text: str,
        voice: str = "Polly.Joanna",
        language: str = "en-US",
    ) -> str:
        """
        Genera TwiML para reproducir texto en una llamada Twilio.

        Args:
            text: Texto a reproducir
            voice: Voz de Twilio (Polly.Joanna, alice, etc.)
            language: Idioma

        Returns:
            TwiML string

        Example:
            | ${twiml}= | Generate TwiML Say | Hello, welcome to our service |
        """
        return f'<Say voice="{voice}" language="{language}">{text}</Say>'

    @keyword("Generate TwiML Gather")
    def generate_twiml_gather(
        self,
        prompt_text: str,
        action_url: str,
        input_type: str = "speech dtmf",
        timeout: int = 5,
        speech_timeout: str = "auto",
        voice: str = "Polly.Joanna",
    ) -> str:
        """
        Genera TwiML para capturar input del usuario (voz o DTMF).

        Args:
            prompt_text: Texto del prompt
            action_url: URL para procesar el input
            input_type: Tipo de input (speech, dtmf, o ambos)
            timeout: Timeout en segundos
            speech_timeout: Timeout para speech (auto o segundos)
            voice: Voz para el prompt

        Returns:
            TwiML string

        Example:
            | ${twiml}= | Generate TwiML Gather | Please say your account number | https://myapp.com/process |
        """
        return f"""<Gather input="{input_type}" action="{action_url}" timeout="{timeout}" speechTimeout="{speech_timeout}">
    <Say voice="{voice}">{prompt_text}</Say>
</Gather>"""

    # =========================================================================
    # CONVERSACIÓN
    # =========================================================================

    @keyword("Add Conversation Turn")
    def add_conversation_turn(
        self,
        role: str,
        text: str,
        confidence: float = 1.0,
        audio_url: Optional[str] = None,
    ):
        """
        Agrega un turno a la conversación actual.

        Args:
            role: Rol del hablante (caller, agent, system)
            text: Texto del turno
            confidence: Confianza de la transcripción (0-1)
            audio_url: URL del audio opcional

        Example:
            | Add Conversation Turn | caller | I need help with my order |
            | Add Conversation Turn | agent | Of course, let me look that up |
        """
        turn = ConversationTurn(
            role=role,
            text=text,
            timestamp=datetime.now(),
            confidence=confidence,
            audio_url=audio_url,
        )
        self._conversation_history.append(turn)
        logger.debug(f"Conversation turn added: {role}: {text[:50]}...")

    @keyword("Get Conversation History")
    def get_conversation_history(self) -> List[Dict[str, Any]]:
        """
        Obtiene el historial de la conversación actual.

        Returns:
            Lista de turnos de conversación

        Example:
            | ${history}= | Get Conversation History |
            | Log | Total turns: ${history.__len__()} |
        """
        return [
            {
                "role": turn.role,
                "text": turn.text,
                "timestamp": turn.timestamp.isoformat(),
                "confidence": turn.confidence,
                "audio_url": turn.audio_url,
            }
            for turn in self._conversation_history
        ]

    @keyword("Get Conversation Transcript")
    def get_conversation_transcript(
        self,
        format: str = "text",
    ) -> str:
        """
        Obtiene la transcripción completa de la conversación.

        Args:
            format: Formato de salida (text, markdown, json)

        Returns:
            Transcripción formateada

        Example:
            | ${transcript}= | Get Conversation Transcript | format=markdown |
        """
        if format == "json":
            return json.dumps(self.get_conversation_history(), indent=2)

        lines = []
        for turn in self._conversation_history:
            if format == "markdown":
                lines.append(f"**{turn.role.upper()}** ({turn.timestamp.strftime('%H:%M:%S')})")
                lines.append(f"> {turn.text}")
                lines.append("")
            else:
                lines.append(f"[{turn.timestamp.strftime('%H:%M:%S')}] {turn.role.upper()}: {turn.text}")

        return "\n".join(lines)

    @keyword("Clear Conversation")
    def clear_conversation(self):
        """
        Limpia el historial de conversación.

        Example:
            | Clear Conversation |
        """
        self._conversation_history = []
        logger.info("Conversation history cleared")

    @keyword("Set Call Context")
    def set_call_context(
        self,
        key: str,
        value: Any,
    ):
        """
        Almacena contexto durante la llamada.

        Args:
            key: Clave del contexto
            value: Valor a almacenar

        Example:
            | Set Call Context | customer_id | 12345 |
            | Set Call Context | account_type | premium |
        """
        self._call_context[key] = value
        logger.debug(f"Call context set: {key}={value}")

    @keyword("Get Call Context")
    def get_call_context(
        self,
        key: Optional[str] = None,
    ) -> Any:
        """
        Obtiene contexto almacenado durante la llamada.

        Args:
            key: Clave del contexto (None para todo el contexto)

        Returns:
            Valor del contexto o todo el diccionario

        Example:
            | ${customer_id}= | Get Call Context | customer_id |
            | ${all_context}= | Get Call Context |
        """
        if key:
            return self._call_context.get(key)
        return self._call_context.copy()

    # =========================================================================
    # GRABACIÓN
    # =========================================================================

    @keyword("Get Call Recording")
    def get_call_recording(
        self,
        call_sid: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Obtiene la grabación de una llamada.

        Args:
            call_sid: SID de la llamada

        Returns:
            URL y metadata de la grabación

        Example:
            | ${recording}= | Get Call Recording |
            | Log | Recording URL: ${recording}[url] |
        """
        self._ensure_twilio_configured()

        sid = call_sid or (self._current_call.call_sid if self._current_call else None)
        if not sid:
            return {"error": "No call SID specified and no current call"}

        try:
            recordings = self._twilio_client.recordings.list(call_sid=sid, limit=1)

            if recordings:
                recording = recordings[0]
                return {
                    "recording_sid": recording.sid,
                    "url": f"https://api.twilio.com{recording.uri.replace('.json', '.mp3')}",
                    "duration": recording.duration,
                    "status": recording.status,
                    "call_sid": sid,
                }
            else:
                return {
                    "error": "No recording found",
                    "call_sid": sid,
                }

        except Exception as e:
            logger.error(f"Failed to get recording: {e}")
            return {"error": str(e)}

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _ensure_twilio_configured(self):
        """Verifica que Twilio esté configurado"""
        if not self._config or not self._twilio_client:
            raise ValueError(
                "Twilio not configured. Use 'Configure Voice Provider' with Twilio credentials first."
            )

    def _ensure_azure_configured(self):
        """Verifica que Azure Speech esté configurado"""
        if not self._config or not self._config.azure_speech_key:
            raise ValueError(
                "Azure Speech not configured. Use 'Configure Voice Provider' with Azure credentials first."
            )

    @keyword("Get Current Call Info")
    def get_current_call_info(self) -> Dict[str, Any]:
        """
        Obtiene información de la llamada actual.

        Returns:
            Diccionario con información de la llamada

        Example:
            | ${call}= | Get Current Call Info |
            | Log | Call from: ${call}[from_number] |
        """
        if not self._current_call:
            return {"error": "No active call"}

        return {
            "call_sid": self._current_call.call_sid,
            "from_number": self._current_call.from_number,
            "to_number": self._current_call.to_number,
            "status": self._current_call.status.value,
            "direction": self._current_call.direction,
            "start_time": self._current_call.start_time.isoformat() if self._current_call.start_time else None,
            "conversation_turns": len(self._conversation_history),
            "context": self._call_context,
        }
