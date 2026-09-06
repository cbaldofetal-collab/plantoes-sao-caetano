import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load doctors safely
let medicos = [];
try {
  const medicosPath = path.join(__dirname, 'medicos.json');
  if (fs.existsSync(medicosPath)) {
    const data = fs.readFileSync(medicosPath, 'utf-8');
    medicos = JSON.parse(data).medicos || [];
  }
} catch (error) {
  console.error('❌ Erro ao carregar medicos.json:', error.message);
}

const TARIFAS = { 'M': 157.50, 'D': 157.50, 'T': 157.50, 'N': 173.25 };
const HORAS = { 'M': 6, 'D': 6, 'T': 6, 'N': 3 };

// Database functions
const dbPath = path.join(__dirname, 'data', 'plantoes.json');
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([]), 'utf-8');
}

function lerPlantoes() {
  try {
    const conteudo = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(conteudo || '[]');
  } catch {
    return [];
  }
}

function salvarPlantoes(plantoes) {
  fs.writeFileSync(dbPath, JSON.stringify(plantoes, null, 2), 'utf-8');
}

// API: Adicionar plantão
app.post('/api/plantoes', (req, res) => {
  try {
    const { crm, data, turno } = req.body;

    if (!crm || !data || !turno) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const medico = medicos.find(m => m.crm === crm);
    if (!medico) {
      return res.status(400).json({ error: 'CRM não encontrado' });
    }

    const plantoes = lerPlantoes();
    const existe = plantoes.find(p => p.crm === crm && p.data === data && p.turno === turno);

    if (existe) {
      return res.status(400).json({ error: `Este médico já possui um plantão em ${data}` });
    }

    const horas = HORAS[turno] || 0;
    const tarifa = TARIFAS[turno] || 0;
    const valor = horas * tarifa;

    plantoes.push({
      id: Date.now(),
      crm,
      nome: medico.nome,
      data,
      turno,
      horas,
      valor,
      created_at: new Date().toISOString()
    });

    salvarPlantoes(plantoes);
    res.json({ success: true, message: 'Plantão adicionado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Listar plantões
app.get('/api/plantoes', (req, res) => {
  try {
    const senha = req.headers['x-password'];
    if (senha !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const plantoes = lerPlantoes();
    const ordenados = plantoes.sort((a, b) => new Date(b.data) - new Date(a.data));
    res.json(ordenados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Exportar Excel
app.get('/api/export-excel', (req, res) => {
  try {
    const senha = req.headers['x-password'];
    if (senha !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const plantoes = lerPlantoes().sort((a, b) => a.nome.localeCompare(b.nome) || new Date(a.data) - new Date(b.data));

    const porMedico = {};
    plantoes.forEach(p => {
      if (!porMedico[p.nome]) {
        porMedico[p.nome] = { crm: p.crm, semana_dia: 0, noite_fds: 0, valor_semana: 0, valor_noite: 0, total: 0 };
      }
      if (p.turno === 'N') {
        porMedico[p.nome].noite_fds += p.horas;
        porMedico[p.nome].valor_noite += p.valor;
      } else {
        porMedico[p.nome].semana_dia += p.horas;
        porMedico[p.nome].valor_semana += p.valor;
      }
      porMedico[p.nome].total += p.valor;
    });

    const dados = [
      ['SEMANA DIA', 'NOITE/FDS', 'R$/HORA', 'R$/HORA'],
      ['R$ 157,50', 'R$ 173,25', '', '']
    ];

    Object.entries(porMedico).forEach(([nome, dm]) => {
      dados.push([
        `R$ ${dm.valor_semana.toFixed(2).replace('.', ',')}`,
        `R$ ${dm.valor_noite.toFixed(2).replace('.', ',')}`,
        '',
        ''
      ]);
    });

    res.json({ success: true, data: dados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', doctors: medicos.length, port: PORT });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ ERRO:', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`✅ ${medicos.length} médicos carregados`);
});
