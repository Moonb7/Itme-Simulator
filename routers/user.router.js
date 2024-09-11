import express from 'express';
import { prisma } from '../utils/prisma/index.js';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const router = express.Router();

// 계정 회원가입 API
router.post('/sign-up', async (req, res, next) => {
  try {
    const { id, password, verifyPassword, name } = req.body;

    if (!id || !password || !verifyPassword || !name)
      return res.status(400).json({ errorMessage: '데이터 형식이 올바르지 않습니다.' });

    // 이미 해당 id로 회원가입했는데 여부확인
    const isExistUser = await prisma.users.findFirst({
      where: {
        id,
      },
    });
    if (isExistUser) {
      return res.status(409).json({ message: '이미 존재하는 아이디입니다.' });
    }

    if (password !== verifyPassword)
      return res.status(400).json({ message: '비밀번호와 비밀번호확인이 다릅니다.' });

    const passwordPattern = /^.{6,}$/;
    if (!passwordPattern.test(password))
      return res.status(400).json({ message: '비밀번호가 6글자 미만입니다.' });

    const idPattern = /^[a-z0-9]+$/;
    if (!idPattern.test(id))
      return res.status(400).json({ message: '아이디는 영문 소문자와 숫자 조합으로만 생성됩니다.' });

    // 비밀번호 해싱 암호화
    const hashedPassword = await bcrypt.hash(password, 10);

    // 트랜잭션
    const user = await prisma.$transaction(
      async (tx) => {
        const { userId } = await tx.users.create({
          data: {
            id: id,
            password: hashedPassword,
            verifyPassword: hashedPassword,
            name: name,
          },
        });

        const user = await tx.users.findFirst({
          where: { userId: userId },
          select: {
            userId: true,
            id: true,
            name: true,
          },
        });
        return user;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, // DB가 커밋된 후
      },
    );

    return res.status(201).json({ data: user });
  } catch (err) {
    return res.status(500).json({ errorMessage: err.message });
  }
});

// 계정 로그인 API - JWT 액세스 토큰 발행
router.post('/sign-in', async (req, res, next) => {
  try {
    const { id, password } = req.body;

    if (!id || !password) return res.status(400).json({ errorMessage: '데이터 형식이 올바르지 않습니다.' });

    const user = await prisma.users.findFirst({ where: { id } });

    if (!user) return res.status(404).json({ message: '존재하지 않는 아이디입니다.' });
    const passwordCheck = await bcrypt.compare(password, user.password);
    if (!passwordCheck) return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET_KEY, { expiresIn: '2h' }); // expiresIn 옵션으로 토큰 만료기한 설정

    res.header('authorization', `Bearer ${token}`);
    return res.status(200).json({ message: '로그인에 성공하였습니다.' });
  } catch (err) {
    return res.status(500).json({ errorMessage: err.message });
  }
});

export default router;
