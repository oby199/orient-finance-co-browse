FROM golang:latest as builder
LABEL maintainer="Adam Jordan <adamyordan@gmail.com>"
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o laplace .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /build/laplace .
COPY files files
EXPOSE 8080
ENV LAPLACE_ADDR=0.0.0.0:8080
ENV LAPLACE_TLS=false
CMD ["./laplace", "-tls=false", "-addr=0.0.0.0:8080"]
