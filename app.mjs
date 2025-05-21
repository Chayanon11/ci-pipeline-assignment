import express from "express";
import cors from "cors";
import { blogPosts } from "./db/index.mjs";

const app = express();
const port = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello TechUp!");
});

app.get("/posts", (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const category = req.query.category || "";
    const keyword = req.query.keyword || "";

    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));

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
    return res.json({
      message: e.message,
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
