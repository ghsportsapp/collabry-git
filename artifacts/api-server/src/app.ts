import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message ?? "Internal server error" });
});

export default app;
