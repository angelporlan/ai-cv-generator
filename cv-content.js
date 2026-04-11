const CV_DEFAULT = `# CV -- [Tu Nombre Completo]

**Location:** [Tu Ubicación]
**Email:** [tu.email@example.com]
**Phone:** [+34 000 00 00 00]
**LinkedIn:** [https://linkedin.com/in/tu-perfil]
**Portfolio:** [https://tu-portfolio.com]
**GitHub:** [https://github.com/tu-usuario]

## Resumen Profesional

[Escribe aquí un breve resumen de tu trayectoria y objetivos profesionales. Por ejemplo: Desarrollador apasionado por la tecnología con experiencia en...]

## Experiencia Profesional

### [Nombre de la Empresa] -- [Ubicación]
**[Tu Cargo]**
[Mes Año] – [Mes Año o Actualidad]

- [Descripción de tu impacto o responsabilidad principal en este rol]
- [Logro clave utilizando tecnologías específicas]
- [Otra responsabilidad relevante o mejora implementada]

### [Otra Empresa] -- [Ubicación]
**[Tu Cargo Anterior]**
[Mes Año] – [Mes Año]

- [Descripción breve de tus funciones principales]
- [Detalle de algún proyecto relevante en el que participaste]

## Proyectos Personales

### [Nombre del Proyecto] (GitHub: [usuario/proyecto])
**[Tu Rol: ej. Creador / Lead Developer]**
[Mes Año] – [Mes Año]

- [Explica qué hace el proyecto y qué tecnologías clave utilizaste]
- [Menciona algún logro, como número de usuarios o funcionalidad crítica]

## Educación
### [Nombre de tu Titulación]
**[Nombre de la Institución/Universidad]**
[Año de inicio] – [Año de finalización]

- [Mención especial, nota media o proyecto final relevante si aplica]

## Skills

- **Backend:** [Node.js, Python, Java, etc.]
- **Frontend:** [React, Angular, HTML5/CSS3, etc.]
- **Bases de Datos:** [PostgreSQL, MongoDB, SQL Server, etc.]
- **Herramientas & Cloud:** [Git, Docker, AWS, Vercel, etc.]`;

const CV_EXAMPLE = `# CV -- Daniel Ruiz Navarro

**Location:** Barcelona, Spain  
**Email:** daniel.ruiz.dev@example.com  
**LinkedIn:** linkedin.com/in/danielruiznavarro  
**Portfolio:** danielruiznav.dev  
**GitHub:** github.com/danielruiz  

---

## Professional Summary

Full-stack AI engineer with 7 years building production-grade machine learning systems. Led the ML infrastructure at a Series B e-commerce company (2019–2025), scaling from 3 models to 20+ in production. Built real-time recommendation systems (22% revenue uplift), demand forecasting pipelines (30% error reduction), and an internal MLOps platform used by 5 engineering teams.

---

## Work Experience

### ShopAI Labs -- Barcelona, Spain  
**Senior ML Engineer / ML Platform Lead**  
2019–2025  

- Led ML platform team (4 engineers), building internal MLOps tools: model registry, experiment tracking system, feature store  
- Designed real-time recommendation pipeline: event streaming → feature engineering → model inference → personalization API (under 60ms latency)  
- Built demand forecasting system using time-series models and deep learning, reducing forecasting error by 30%  
- Improved deployment workflows, reducing model release cycles from 10 days to under 6 hours using CI/CD pipelines (GitHub Actions + AWS)  
- Implemented monitoring systems: drift detection, alerting, dashboards (Prometheus + Grafana), automated retraining pipelines  

---

### DataVision Tech -- Remote  
**Machine Learning Engineer**  
2017–2019  

- Developed NLP pipeline for customer support ticket classification (RoBERTa fine-tuning, 92% accuracy)  
- Implemented semantic search engine using embeddings and vector databases  
- Built experimentation framework with MLflow and automated model versioning  

---

## Projects

- **RecoStream** (Open Source) -- Real-time recommendation engine using streaming data and microservices architecture. 700+ GitHub stars  
- **LLM Guardrails Kit** (Open Source) -- Toolkit for evaluating and monitoring LLM applications, including safety checks and regression testing  

---

## Education

- MSc Artificial Intelligence, Universitat Politècnica de Catalunya (2017)  
- BSc Computer Engineering, Universidad de Sevilla (2015)  

---

## Skills

- **ML/AI:** PyTorch, TensorFlow, scikit-learn, Hugging Face, LangChain  
- **MLOps:** AWS SageMaker, MLflow, Kubeflow, Airflow, Feature Store  
- **Infrastructure:** Kubernetes, Kafka, Redis, PostgreSQL, AWS  
- **Languages:** Python, Go, TypeScript, SQL`;

module.exports = {
  CV_DEFAULT,
  CV_EXAMPLE,
  CV_MAPPING: {
    'cv.md': CV_DEFAULT,
    'cv-example.md': CV_EXAMPLE
  }
};
