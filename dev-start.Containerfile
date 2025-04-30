FROM docker.io/library/ubuntu:24.04


RUN apt update && apt upgrade -y &&\
    apt install -y openjdk-8-jdk-headless ant wget unzip python3 python-is-python3 &&\
    apt clean

COPY . /src

WORKDIR /src

RUN cd /src && ./dev.sh setup

ENV WEB_BINDADDRESS=0.0.0.0
ENV CODESERVER_BINDADDRESS=0.0.0.0

EXPOSE 8000
EXPOSE 9876

CMD ./dev.sh start
