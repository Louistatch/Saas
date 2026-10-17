FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node ops/supabase-monitor/main.mjs ./main.mjs
USER node
CMD ["node", "main.mjs"]
