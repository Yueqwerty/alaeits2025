require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username y password son requeridos' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (passwordIsValid) {
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      return res.status(200).json({ message: 'Autenticación exitosa', token: token });
    } else {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
  } catch (error) {
    console.error('Error en /api/login:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};