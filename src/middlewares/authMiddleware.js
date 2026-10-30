const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Not authorized" });
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ message: "Invalid or expired token" }); }
  try {
    const user = await User.findById(decoded.id).select("role isBanned");
    if (!user) return res.status(401).json({ message: "User no longer exists" });
    if (user.isBanned) return res.status(403).json({ message: "Account is banned" });
    req.user = { id: String(user._id), role: user.role };
    next();
  } catch (error) { next(error); }
};
module.exports = authMiddleware;
