import express, { Request, Response, NextFunction } from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";
import rateLimit from "express-rate-limit";
import csrf from "csurf";
import cookieParser from "cookie-parser";
import crypto from "crypto";

const app = express();
const photosDir = path.join(__dirname, "../public/photos");
const ratingsFile = path.join(__dirname, "../ratings.json");

const browserCheck = (req: Request, res: Response, next: NextFunction) => {
  const userAgent = req.headers["user-agent"];
  if (!userAgent || !userAgent.includes("Mozilla")) {
    return res.status(403).send("Access forbidden: Browser requests only");
  }
  next();
};

app.use(cors());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());
app.use(browserCheck);

app.get("/", (req: Request, res: Response) => {
  //@ts-ignore
  res.render("index", { csrfToken: req.csrfToken() });
});

const generateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  if (!req.cookies["XSRF-TOKEN"]) {
    const csrfToken = crypto.randomBytes(64).toString("hex");
    res.cookie("XSRF-TOKEN", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
  }
  next();
};

app.use(generateCSRFToken);

const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  const csrfCookie = req.cookies["XSRF-TOKEN"];
  const csrfHeader = req.headers["x-csrf-token"];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
};

const refererCheck = (req: Request, res: Response, next: NextFunction) => {
  const referer = req.headers.referer;
  if (!referer || !referer.includes(req.get("host")!)) {
    return res.status(403).send("Access forbidden: Invalid referer");
  }
  next();
};

const limiter = rateLimit({
  windowMs: 4 * 60 * 1000,
  max: 100,
});

// app.use(limiter);

let globalRatings: { [key: string]: number } = {};

async function loadRatings() {
  try {
    const data = await fs.readFile(ratingsFile, "utf8");
    globalRatings = JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(
        "ratings.json does not exist. Starting with an empty object.",
      );
      globalRatings = {};
    } else {
      console.error("Error loading ratings:", error);
      globalRatings = {};
    }
  }
}

async function saveRatings() {
  try {
    await fs.writeFile(ratingsFile, JSON.stringify(globalRatings, null, 2));
  } catch (error) {
    console.error("Error saving ratings:", error);
  }
}

loadRatings();

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

app.get("/get-csrf-token", (req, res) => {
  const csrfToken = crypto.randomBytes(64).toString("hex");
  res.cookie("XSRF-TOKEN", csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.json({ csrfToken });
});

app.get(
  "/photos",
  refererCheck,
  csrfProtection,
  async (req: Request, res: Response) => {
    try {
      const files = await fs.readdir(photosDir);
      const photoFiles = files.filter((file) =>
        /\.(jpg|jpeg|png|gif)$/.test(file),
      );
      res.json(photoFiles);
    } catch (err) {
      console.error(`Error reading directory ${photosDir}:`, err);
      res.status(500).send("Unable to scan directory");
    }
  },
);

app.get("/initial-ratings", refererCheck, csrfProtection, async (req, res) => {
  try {
    res.json(globalRatings);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      res.json({});
    } else {
      console.error("Error reading ratings file:", error);
      res.status(500).json({ error: "Unable to retrieve ratings" });
    }
  }
});

app.post(
  "/update-ratings",
  refererCheck,
  csrfProtection,
  async (req: Request, res: Response) => {
    const { ratings } = req.body;
    if (!ratings || typeof ratings !== "object") {
      return res.status(400).send("Invalid input");
    }

    for (const [photo, newRating] of Object.entries(
      ratings as { [key: string]: number },
    )) {
      if (typeof newRating === "number") {
        globalRatings[photo] = newRating;
      }
    }

    await saveRatings();
    res.status(200).send("Ratings updated");
  },
);

app.get(
  "/summary",
  refererCheck,
  csrfProtection,
  (req: Request, res: Response) => {
    const sortedRatings = Object.entries(globalRatings)
      .sort(([, a], [, b]) => b - a)
      .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

    res.json(sortedRatings);
  },
);

const port = 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
