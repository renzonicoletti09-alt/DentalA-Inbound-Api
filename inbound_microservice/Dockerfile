FROM node:22-alpine

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json de la raíz y del microservicio
COPY package*.json ./
COPY inbound_microservice/package*.json ./inbound_microservice/

# Instalar dependencias en la raíz (para que /app/services encuentre sus dependencias)
RUN npm install --omit=dev

# Instalar dependencias del microservicio
WORKDIR /app/inbound_microservice
RUN npm install --omit=dev

# Volver a la raíz para copiar los servicios compartidos
WORKDIR /app
COPY services ./services
COPY inbound_microservice ./inbound_microservice

# Cambiar al directorio del servicio para ejecutar
WORKDIR /app/inbound_microservice

EXPOSE 3000
CMD ["node", "server.js"]
