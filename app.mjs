import express from "express";
import cors from "cors";
import { blogPosts } from "./db/index.mjs";
import helmet from "helmet";

const app = express();
const port = process.env.PORT || 4001;



const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET'], // Only allow GET methods for this API
  optionsSuccessStatus: 200
};

// Add security headers and hide Express
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// Remove X-Powered-By header
app.disable('x-powered-by');


// app.use(cors());
// app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello TechUp!");
});

app.get("/posts", (req, res) => {
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const category = req.query.category || "";
    const keyword = req.query.keyword || "";

    // Validate pagination parameters
    if (page && isNaN(Number(page)) || limit && isNaN(Number(limit))) {
      return res.status(400).json({
        message: "Invalid pagination parameters"
      });
    }

    const numPage = Number(page) || 1;
    const numLimit = Number(limit) || 6;

    const safePage = Math.max(1, numPage);
    const safeLimit = Math.max(1, Math.min(100, numLimit));

    // Handle extremely large numbers that might cause performance issues
    if (safePage > 1000000 || safeLimit > 1000000) {
      return res.status(500).json({
        message: "Pagination values too large"
      });
    }

    let filteredPosts = blogPosts;
    if (category) {
      filteredPosts = blogPosts.filter(
        (post) => post.category.toLowerCase() === category.toLowerCase()
      );
    }

    if (keyword) {
      filteredPosts = filteredPosts.filter(
        (post) =>
          post.title.toLowerCase().includes(keyword.toLowerCase()) ||
          post.description.toLowerCase().includes(keyword.toLowerCase()) ||
          post.content.toLowerCase().includes(keyword.toLowerCase()) ||
          post.category.toLowerCase().includes(keyword.toLowerCase())
      );
    }

    const startIndex = (safePage - 1) * safeLimit;
    const endIndex = startIndex + safeLimit;

    const results = {
      totalPosts: filteredPosts.length,
      totalPages: Math.ceil(filteredPosts.length / safeLimit),
      currentPage: safePage,
      limit: safeLimit,
      posts: filteredPosts.slice(startIndex, endIndex),
    };

    if (endIndex < filteredPosts.length) {
      results.nextPage = safePage + 1;
    }

    if (startIndex > 0) {
      results.previousPage = safePage - 1;
    }

    return res.json(results);
  } catch (e) {
    return res.status(500).json({
      message: e.message
    });
  }
});

app.get("/posts/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const post = blogPosts.find((post) => post.id === id);

  if (!post) {
    return res.status(404).json({ error: "Blog post not found" });
  }

  res.json(post);
});

export default app;
