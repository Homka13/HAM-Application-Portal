FROM alpine:3.18

RUN apk add --no-cache dcron curl rclone postgresql-client

WORKDIR /app
COPY backup.sh .
RUN chmod +x backup.sh

RUN echo "0 3 * * * /app/backup.sh" > /etc/crontabs/root

CMD ["crond", "-f", "-l", "8"]
