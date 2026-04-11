#!/usr/bin/env python3
"""
Servidor para recibir webhooks de GitHub y actualizar Docker
Uso: python3 webhook-handler-python.py
"""
import os
import sys
import json
import hmac
import hashlib
import subprocess
import logging
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Configuración
PORT = int(os.getenv('WEBHOOK_PORT', 9000))
WEBHOOK_SECRET = os.getenv('WEBHOOK_SECRET', '')
PROJECT_DIR = os.getenv('PROJECT_DIR', '/opt/ia-microservice')
LOG_DIR = os.getenv('LOG_DIR', '/var/log')
LOG_FILE = os.path.join(LOG_DIR, 'docker-webhook.log')

# Configurar logging
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


def verify_signature(payload, signature):
    """Verifica la firma del webhook de GitHub"""
    if not WEBHOOK_SECRET:
        return True  # Sin secret, no validar
    
    expected_signature = 'sha256=' + hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


def update_container(image):
    """Actualiza el contenedor Docker"""
    logger.info(f"Actualizando contenedor con imagen: {image}")
    
    try:
        os.chdir(PROJECT_DIR)
        
        # Hacer pull de la nueva imagen
        logger.info(f"Haciendo pull de {image}")
        subprocess.run(['docker', 'pull', image], check=True, capture_output=True)
        
        # Reiniciar contenedor
        logger.info("Reiniciando contenedor...")
        subprocess.run(
            ['docker-compose', '-f', 'docker-compose.prod.yml', 'up', '-d'],
            check=True,
            capture_output=True
        )
        
        logger.info("Contenedor actualizado exitosamente")
        return True
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Error al actualizar contenedor: {e}")
        return False
    except Exception as e:
        logger.error(f"Error inesperado: {e}")
        return False


class WebhookHandler(BaseHTTPRequestHandler):
    """Handler para solicitudes HTTP de webhooks"""
    
    def do_POST(self):
        """Maneja POST requests"""
        content_length = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(content_length)
        
        # Verificar firma
        signature = self.headers.get('X-Hub-Signature-256', '')
        if not verify_signature(payload, signature):
            logger.warning("Firma del webhook inválida")
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Unauthorized'}).encode())
            return
        
        try:
            data = json.loads(payload.decode())
            image = data.get('image')
            
            if not image:
                logger.warning("No se encontró 'image' en el payload")
                raise ValueError('Missing image field')
            
            # Actualizar contenedor
            if update_container(image):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'updated'}).encode())
            else:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Update failed'}).encode())
                
        except json.JSONDecodeError:
            logger.error("Payload JSON inválido")
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Invalid JSON'}).encode())
        except Exception as e:
            logger.error(f"Error procesando webhook: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
    
    def log_message(self, format, *args):
        """Log de solicitudes HTTP"""
        logger.info("%s - %s" % (self.client_address[0], format % args))


if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), WebhookHandler)
    logger.info(f"Servidor de webhooks escuchando en puerto {PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Servidor detenido")
        sys.exit(0)
