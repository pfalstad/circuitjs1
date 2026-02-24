FROM docker.io/library/gradle:jdk8-ubi


RUN microdnf install -y python3 && microdnf clean all
COPY . /src

WORKDIR /src

RUN cd /src &&\
    gradle compileGwt --console verbose --info &&\
    gradle makeSite --console verbose --info


EXPOSE 8000

CMD cd /src/site && python3 -m http.server
