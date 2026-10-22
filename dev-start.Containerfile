FROM docker.io/library/node:22

COPY . /src

WORKDIR /src/ts

RUN npm install

EXPOSE 5173

# npm install runs again at container start (not just at image build time) so
# that bind-mounting the repo over /src for live editing — which shadows the
# node_modules installed above — still gets a working install before Vite
# starts.
CMD npm install && npm run dev -- --host
