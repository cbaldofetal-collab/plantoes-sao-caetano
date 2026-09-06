import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// Load doctors
let medicos = [];
try {
  const medicosPath = path.join(__dirname, '..', 'medicos.json');
  if (fs.existsSync(medicosPath)) {
    const data = fs.readFileSync(medicosPath, 'utf-8');
    medicos = JSON.parse(data).medicos || [];
  }
} catch (error) {
  console.error('❌ Erro ao carregar medicos.json:', error.message);
}

const TARIFAS = { 'M': 157.50, 'D': 157.50, 'T': 157.50, 'N': 173.25 };
const HORAS = { 'M': 6, 'D': 6, 'T': 6, 'N': 3 };

// Database
const dbPath = path.join(__dirname, '..', 'data', 'plantoes.json');
const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([]), 'utf-8');
}

function lerPlantoes() {
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8') || '[]');
  } catch {
    return [];
  }
}

function salvarPlantoes(plantoes) {
  fs.writeFileSync(dbPath, JSON.stringify(plantoes, null, 2), 'utf-8');
}

// Routes
app.post('/api/plantoes', (req, res) => {
  try {
    const { crm, data, turno } = req.body;
    if (!crm || !data || !turno) return res.status(400).json({ error: 'Dados incompletos' });

    const medico = medicos.find(m => m.crm === crm);
    if (!medico) return res.status(400).json({ error: 'CRM não encontrado' });

    const plantoes = lerPlantoes();
    if (plantoes.find(p => p.crm === crm && p.data === data && p.turno === turno)) {
      return res.status(400).json({ error: 'Plantão duplicado' });
    }

    plantoes.push({
      id: Date.now(),
      crm,
      nome: medico.nome,
      data,
      turno,
      horas: HORAS[turno] || 0,
      valor: (HORAS[turno] || 0) * (TARIFAS[turno] || 0),
      created_at: new Date().toISOString()
    });

    salvarPlantoes(plantoes);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/plantoes', (req, res) => {
  try {
    if (req.headers['x-password'] !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    res.json(lerPlantoes().sort((a, b) => new Date(b.data) - new Date(a.data)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, doctors: medicos.length });
});

export default app;
