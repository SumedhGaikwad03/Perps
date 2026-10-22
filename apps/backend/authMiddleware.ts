import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export function authmiddleware(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.token as string;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!);

        if (decoded) {
            (req as any).userId = (decoded as any).userId;
            next();
        } else {
            res.status(403).json({
                message: "Incorrect token"
            });
        }
    } catch (e) {
        res.status(403).json({
            message: "Incorrect token"
        });
    }
}
