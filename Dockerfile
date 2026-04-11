# Etapa de construcción
FROM node:18-alpine as builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Etapa de producción
FROM node:18-alpine

WORKDIR /app

# Copiar las dependencias de la etapa anterior
COPY --from=builder /app/node_modules ./node_modules

# Copiar archivos de la aplicación
COPY . .

# Exponer el puerto
EXPOSE 3002

# Comando de inicio
CMD ["npm", "start"]
