FROM python:3.12-slim
WORKDIR /app
# seed.cs[v]: copied when present, no build error when it is not
COPY server.py seed.cs[v] ./
COPY dist ./dist
RUN useradd --system app && mkdir /data && chown app /data
USER app
ENV RND_DB=/data/rnd.db PORT=8080 PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8080
CMD ["python", "server.py"]
