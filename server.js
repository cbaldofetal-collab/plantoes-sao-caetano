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
app.use(express.static('public'));

// Banco de dados em JSON
const dbPath = path.join(__dirname, 'data', 'plantoes.json');
const dataDir = path.join(__dirname, 'data');

// Garante que o diretório existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Inicializa arquivo JSON se não existir
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

const medicos = JSON.parse(fs.readFileSync(path.join(__dirname, 'medicos.json'), 'utf-8')).medicos;

// Preços por turno (em R$)
const TARIFAS = {
  'M': 157.50, // Manhã
  'D': 157.50, // Dia
  'T': 157.50, // Tarde
  'N': 173.25  // Noite
};

const HORAS = {
  'M': 6,
  'D': 6,
  'T': 6,
  'N': 3
};

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
      return res.status(400).json({ error: `Este médico já possui um plantão em ${data} no turno ${turno === 'M' ? 'Manhã' : turno === 'D' ? 'Dia' : turno === 'T' ? 'Tarde' : 'Noite'}` });
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

// API: Listar plantões (protegido por senha)
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

    // Agrupar por médico
    const porMedico = {};
    plantoes.forEach(p => {
      if (!porMedico[p.nome]) {
        porMedico[p.nome] = {
          crm: p.crm,
          semana_dia: 0,
          noite_fds: 0,
          valor_semana: 0,
          valor_noite: 0,
          total: 0
        };
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

    // Criar dados para Excel
    const dados = [
      ['SEMANA DIA', 'NOITE/FDS', 'R$/HORA', 'R$/HORA'],
      ['R$ 157,50', 'R$ 173,25', '', '']
    ];

    Object.entries(porMedico).forEach(([nome, dados_medico]) => {
      dados.push([
        `R$ ${dados_medico.valor_semana.toFixed(2).replace('.', ',')}`,
        `R$ ${dados_medico.valor_noite.toFixed(2).replace('.', ',')}`,
        '',
        ''
      ]);
    });

    dados.push(['TOTAL R$', 'TOTAL R$']);
    Object.entries(porMedico).forEach(([nome, dados_medico]) => {
      const row = dados[dados.length - 1];
      row[0] = parseFloat(row[0].replace('R$ ', '').replace(',', '.')) + dados_medico.valor_semana;
      row[1] = parseFloat(row[1].replace('R$ ', '').replace(',', '.')) + dados_medico.valor_noite;
    });

    // Usar biblioteca XLSX
    import('xlsx').then(({ utils, writeFile }) => {
      const ws = utils.aoa_to_sheet(dados);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Plantões');

      const filename = `plantoes_${new Date().toISOString().split('T')[0]}.xlsx`;
      const filepath = path.join(__dirname, filename);
      writeFile(wb, filepath);

      res.download(filepath, filename, () => {
        fs.unlinkSync(filepath);
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em porta ${PORT}`);
});
