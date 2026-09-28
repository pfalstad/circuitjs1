FROM docker.io/library/node:22

COPY . /src

WORKDIR /src/ts

RUN npm install && npm run build

EXPOSE 8000

CMD ["npm", "run", "preview", "--", "--host", "--port", "8000"]
