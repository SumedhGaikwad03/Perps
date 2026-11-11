import { prisma } from "db";

import { Router } from "express"; 

import jwt from "jsonwebtoken"; 

export const authRouter = Router();  

// there are all the auth endpoints in the project

authRouter.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== "string") {
      return res
        .status(400)
        .json({ error: "Username  and password are required" });
    }

    // we check for dupicate username here in the database
    const userExist = await prisma.user.findUnique({
      where: {
        username: username,
      },
    });

    if (userExist) {
      return res.status(409).json("This username already exist broo");
    }

    //hash the password with bun
    const hashPassword = await Bun.password.hash(password);

    // this is db event that stoes the user object in the schema
    const response = await prisma.user.create({
      data: {
        username: username,
        password: hashPassword,
        wallet: {
          create: {
            amountAvail: "0",
            amountLocked: "0",
          },
        },
      },
    });

    res.status(201).json({
      id: response.id,
      message: "You have created an id here ",
    });
  } catch (e) {
    console.error(e);

    res
      .status(500)
      .json({ error: "Internal Server Error", details: String(e) });
  }
});

authRouter.post("/signin", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const User = await prisma.user.findUnique({
      where: {
        username: username,
      },
    });

    if (!User) {
      return res
        .status(401)
        .json({ message: "This user does not exists broo " });
    }

    // we kinda de-hash the password to verify it with the given password by the user
    const isPasswordVaild = await Bun.password.verify(password, User!.password);

    if (!isPasswordVaild) {
      return res
        .status(401)
        .json({ message: "The password or username  is wrong brooo " });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    // give user a signed token that is valid for 8h through which all the requests could be vaildated
    const token = jwt.sign(
      {
        // this is the data we are storing inside the token
        userId: User!.id,
      },
      secret,
      { expiresIn: "8h" },
    );

    return res.status(200).json({
      id: User!.id,
      token,
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: String(e) });
  }
});

