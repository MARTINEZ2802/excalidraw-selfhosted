FROM node:20-alpine AS build
RUN apk add --no-cache git
ARG ROOM_REF=master
WORKDIR /app
RUN git clone --depth 1 --branch ${ROOM_REF} https://github.com/excalidraw/excalidraw-room.git .
RUN yarn install --frozen-lockfile && yarn build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
# Render inyecta PORT; el servidor escucha en process.env.PORT
EXPOSE 10000
CMD ["node", "dist/index.js"]
