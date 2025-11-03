/**
 * Sistema Profesional de Gestión de Certificados con API
 * Autenticación: ID + Email
 * Versión robusta con manejo de errores
 */

(function() {
    'use strict';

    class CertificadosAPISystem {
        constructor() {
            this.currentCertificates = [];
            this.currentUserData = null;
            this.isProcessing = false;
            this.apiBaseUrl = this.detectAPIBaseUrl();
            this.lastRequestTime = 0;
            this.requestCooldown = 3000; // 3 segundos entre requests

            this.init();
        }

        detectAPIBaseUrl() {
            // En producción usa rutas relativas, en desarrollo detecta el puerto
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                const port = window.location.port || '3001';
                return `http://localhost:${port}`;
            }
            return ''; // Producción: rutas relativas
        }

        init() {
            this.checkSession();
            this.setupEventListeners();
            this.setupParticipantTypeToggle();
        }

        setupParticipantTypeToggle() {
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabContents = document.querySelectorAll('.tab-content');
            const participantTypeInput = document.getElementById('participant-type');

            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const targetTab = button.getAttribute('data-tab');

                    // Update buttons
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');

                    // Update content
                    tabContents.forEach(content => {
                        content.classList.remove('active');
                        if (content.getAttribute('data-content') === targetTab) {
                            content.classList.add('active');
                        }
                    });

                    // Update hidden input
                    if (participantTypeInput) {
                        participantTypeInput.value = targetTab;
                    }
                });
            });
        }

        setupEventListeners() {
            const loginForm = document.getElementById('login-form');
            const logoutBtn = document.getElementById('logout-btn');
            const pdfCloseBtn = document.getElementById('pdf-close-btn');
            const addCertificateBtn = document.getElementById('add-certificate-btn');

            if (loginForm) {
                loginForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleLogin();
                });
            }

            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    this.handleLogout();
                });
            }

            if (addCertificateBtn) {
                addCertificateBtn.addEventListener('click', () => {
                    this.handleAddCertificate();
                });
            }

            // Enter en el campo de agregar certificado
            const addPaperInput = document.getElementById('add-paper-id');
            if (addPaperInput) {
                addPaperInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.handleAddCertificate();
                    }
                });
            }

            if (pdfCloseBtn) {
                pdfCloseBtn.addEventListener('click', () => {
                    this.closePDFModal();
                });
            }

            // Cerrar modal con ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closePDFModal();
                }
            });

            // Cerrar modal al hacer clic en el fondo oscuro
            const pdfModal = document.getElementById('pdf-modal');
            if (pdfModal) {
                pdfModal.addEventListener('click', (e) => {
                    if (e.target === pdfModal) {
                        this.closePDFModal();
                    }
                });
            }
        }

        checkSession() {
            try {
                const savedData = sessionStorage.getItem('certificados_data');
                if (savedData) {
                    const data = JSON.parse(savedData);
                    this.currentCertificates = data.certificates;
                    this.currentUserData = data.userData;
                    this.showDocumentView();
                }
            } catch (e) {
                sessionStorage.removeItem('certificados_data');
            }
        }

        async handleLogin() {
            if (this.isProcessing) {
                return;
            }

            // Rate limiting: prevenir spam de requests
            const now = Date.now();
            if (now - this.lastRequestTime < this.requestCooldown) {
                const remainingSeconds = Math.ceil((this.requestCooldown - (now - this.lastRequestTime)) / 1000);
                this.showError(`Por favor, espere ${remainingSeconds} segundos antes de intentar nuevamente.`);
                return;
            }

            // Determinar el tipo de participante del hidden input
            const participantTypeInput = document.getElementById('participant-type');
            const participantType = participantTypeInput ? participantTypeInput.value : 'presenter';

            // Obtener los campos según el tipo
            const paperIdInput = document.getElementById('paper-id');
            const symposiumIdInput = document.getElementById('symposium-id');

            let emailInput;
            if (participantType === 'presenter') {
                emailInput = document.getElementById('email-presenter');
            } else if (participantType === 'symposium') {
                emailInput = document.getElementById('email-symposium');
            } else {
                emailInput = document.getElementById('email-attendee');
            }

            if (!emailInput) {
                this.showError('Error en el formulario. Por favor, recargue la página.');
                return;
            }

            // Sanitizar inputs (remover caracteres peligrosos)
            let paperId = null;
            let symposiumId = null;

            if (participantType === 'presenter' && paperIdInput) {
                paperId = this.sanitizeInput(paperIdInput.value.trim());
            } else if (participantType === 'symposium' && symposiumIdInput) {
                symposiumId = this.sanitizeInput(symposiumIdInput.value.trim());
            }

            let email = this.sanitizeInput(emailInput.value.trim());

            this.hideError();

            // Validaciones del lado del cliente
            if (participantType === 'presenter') {
                if (!paperId) {
                    this.showError('Por favor, ingrese el ID de su ponencia.');
                    return;
                }

                // Validar formato de paper_id (letra + números)
                if (!this.isValidPaperId(paperId)) {
                    this.showError('El ID de ponencia debe tener formato: P513, E506, Z20, etc.');
                    return;
                }

                // Límite de longitud para paper_id
                if (paperId.length > 20) {
                    this.showError('El ID de ponencia es demasiado largo.');
                    return;
                }
            } else if (participantType === 'symposium') {
                if (!symposiumId) {
                    this.showError('Por favor, ingrese el ID de su simposio.');
                    return;
                }

                // Validar formato de symposium_id (SIM + números)
                if (!this.isValidSymposiumId(symposiumId)) {
                    this.showError('El ID de simposio debe tener formato: SIM1, SIM2, SIM10, etc.');
                    return;
                }

                // Límite de longitud para symposium_id
                if (symposiumId.length > 20) {
                    this.showError('El ID de simposio es demasiado largo.');
                    return;
                }
            }

            if (!email) {
                this.showError('Por favor, ingrese su correo electrónico.');
                return;
            }

            if (!this.isValidEmail(email)) {
                this.showError('Por favor, ingrese un correo electrónico válido.');
                return;
            }

            // Límite de longitud para email
            if (email.length > 255) {
                this.showError('El correo electrónico es demasiado largo.');
                return;
            }

            this.setLoadingState(true);
            this.lastRequestTime = now;

            try {
                const url = `${this.apiBaseUrl}/api/certificates/validate`;

                // Construir body según el tipo de participante
                const requestBody = {
                    email: email
                };

                // Agregar ID según el tipo
                if (participantType === 'presenter' && paperId) {
                    requestBody.paper_id = paperId;
                } else if (participantType === 'symposium' && symposiumId) {
                    requestBody.symposium_id = symposiumId;
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    // Inicializar con el primer certificado
                    this.currentCertificates = [data.certificate];
                    this.currentUserData = {
                        author_name: data.certificate.author_name,
                        author_email: data.certificate.author_email
                    };

                    sessionStorage.setItem('certificados_data', JSON.stringify({
                        certificates: this.currentCertificates,
                        userData: this.currentUserData
                    }));

                    this.showDocumentView();
                } else {
                    this.showError(data.message || 'Credenciales inválidas. Verifique su ID y correo electrónico.');
                }

            } catch (error) {
                this.showError(`Error de conexión. Por favor, intente nuevamente.`);
            } finally {
                this.setLoadingState(false);
            }
        }

        async handleAddCertificate() {
            if (this.isProcessing) {
                return;
            }

            const addPaperInput = document.getElementById('add-paper-id');
            const addBtn = document.getElementById('add-certificate-btn');

            if (!addPaperInput) {
                return;
            }

            let paperId = this.sanitizeInput(addPaperInput.value.trim());

            if (!paperId) {
                return;
            }

            // Validar formato
            if (!this.isValidPaperId(paperId)) {
                alert('El ID de ponencia debe tener formato: P513, E506, Z20, etc.');
                return;
            }

            // Verificar si ya existe
            if (this.currentCertificates.some(cert => cert.paper_id.toUpperCase() === paperId.toUpperCase())) {
                alert('Este certificado ya está en la lista.');
                addPaperInput.value = '';
                return;
            }

            // Deshabilitar botón
            if (addBtn) {
                addBtn.disabled = true;
                addBtn.textContent = 'Agregando...';
            }

            this.isProcessing = true;

            try {
                const url = `${this.apiBaseUrl}/api/certificates/validate`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        paper_id: paperId,
                        email: this.currentUserData.author_email
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    // Agregar el nuevo certificado a la lista
                    this.currentCertificates.push(data.certificate);

                    // Actualizar sessionStorage
                    sessionStorage.setItem('certificados_data', JSON.stringify({
                        certificates: this.currentCertificates,
                        userData: this.currentUserData
                    }));

                    // Re-renderizar
                    this.showDocumentView();

                    // Limpiar input
                    addPaperInput.value = '';
                } else {
                    alert(data.message || 'No se encontró el certificado con ese ID para su correo.');
                }

            } catch (error) {
                alert('Error de conexión. Por favor, intente nuevamente.');
            } finally {
                this.isProcessing = false;
                if (addBtn) {
                    addBtn.disabled = false;
                    addBtn.textContent = 'Agregar';
                }
            }
        }

        sanitizeInput(input) {
            // Remover caracteres potencialmente peligrosos
            return input
                .replace(/[<>'"]/g, '') // Remover <, >, ', "
                .replace(/javascript:/gi, '') // Remover javascript:
                .replace(/on\w+=/gi, ''); // Remover onclick=, onerror=, etc
        }

        isValidEmail(email) {
            // Regex más estricto para emails
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            return emailRegex.test(email);
        }

        isValidPaperId(paperId) {
            // Formato: 1-2 letras seguidas de 1-5 números (P513, E506, Z20, etc.)
            const paperIdRegex = /^[A-Z]{1,2}\d{1,5}$/i;
            return paperIdRegex.test(paperId);
        }

        isValidSymposiumId(symposiumId) {
            // Formato: SIM seguido de 1-3 números (SIM1, SIM2, SIM10, etc.)
            const symposiumIdRegex = /^SIM\d{1,3}$/i;
            return symposiumIdRegex.test(symposiumId);
        }

        showDocumentView() {
            const loginView = document.getElementById('login-view');
            const documentView = document.getElementById('document-view');

            if (!loginView || !documentView) {
                return;
            }

            if (!this.currentUserData || !this.currentCertificates || this.currentCertificates.length === 0) {
                return;
            }

            // Forzar ocultación del login y mostrar documento
            loginView.style.display = 'none';
            loginView.classList.add('hidden');

            documentView.style.display = 'block';
            documentView.classList.remove('hidden');

            // Llenar información del usuario
            const userName = document.getElementById('user-name');
            const userEmail = document.getElementById('user-email');
            const userPaperId = document.getElementById('user-paper-id');

            if (userName) userName.textContent = this.currentUserData.author_name;
            if (userEmail) userEmail.textContent = this.currentUserData.author_email;

            // Solo mostrar paper_id si es ponente o simposio
            if (userPaperId) {
                const isAttendee = this.currentCertificates.length > 0 &&
                                 (this.currentCertificates[0].type === 'attendee' || !this.currentCertificates[0].paper_id);

                if (isAttendee) {
                    // Ocultar completamente el elemento paper_id para oyentes
                    userPaperId.parentElement.style.display = 'none';
                } else {
                    const paperIds = this.currentCertificates.map(c => c.paper_id).filter(id => id).join(', ');
                    userPaperId.textContent = paperIds;
                    userPaperId.parentElement.style.display = '';
                }
            }

            this.renderCertificates();
            window.scrollTo(0, 0);
        }

        renderCertificates() {
            const container = document.getElementById('certificate-container');
            if (!container) {
                return;
            }

            container.innerHTML = '';

            // Ocultar sección "agregar certificado" si es oyente o simposio
            const addCertificateSection = document.querySelector('.add-certificate-section');
            const isAttendee = this.currentCertificates.length > 0 && this.currentCertificates[0].type === 'attendee';
            const isSymposium = this.currentCertificates.length > 0 && this.currentCertificates[0].type === 'symposium';

            if (addCertificateSection) {
                addCertificateSection.style.display = (isAttendee || isSymposium) ? 'none' : 'block';
            }

            // Renderizar cada certificado
            this.currentCertificates.forEach((cert, index) => {
                const tipoInfo = this.getTipoCertificado(cert.paper_id, cert.type);
                const isAttendee = cert.type === 'attendee' || !cert.paper_id;
                const isSymposium = cert.type === 'symposium' || (cert.paper_id && cert.paper_id.toUpperCase().startsWith('SIM'));

                const card = document.createElement('div');
                card.className = 'certificate-card fade-in';
                card.style.animationDelay = `${index * 0.1}s`;

                // Construir el texto del tipo (con o sin paper_id)
                const typeText = cert.paper_id
                    ? `${tipoInfo.tipo} - ${this.escapeHtml(cert.paper_id)}`
                    : tipoInfo.tipo;

                // Construir meta items
                let metaHtml = '';
                if (!isAttendee && !isSymposium) {
                    metaHtml = `
                        <div class="certificate-meta">
                            ${cert.eje ? `
                                <div class="meta-item">
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                    </svg>
                                    <span>${this.escapeHtml(cert.eje)}</span>
                                </div>
                            ` : ''}
                            ${cert.country ? `
                                <div class="meta-item">
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                    <span>${this.escapeHtml(cert.country)}</span>
                                </div>
                            ` : ''}
                            <div class="meta-item">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                                <span>${this.formatDate(cert.generated_at)}</span>
                            </div>
                        </div>
                    `;
                } else if (isSymposium) {
                    // Para simposios, mostrar fecha
                    metaHtml = `
                        <div class="certificate-meta">
                            <div class="meta-item">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                                <span>${this.formatDate(cert.generated_at)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    // Para oyentes, solo mostrar país si existe
                    metaHtml = `
                        <div class="certificate-meta">
                            ${cert.country ? `
                                <div class="meta-item">
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                    <span>${this.escapeHtml(cert.country)}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }

                // Institución solo para ponentes
                let institutionHtml = '';
                if (!isAttendee && !isSymposium && cert.institution) {
                    institutionHtml = `
                        <div class="certificate-institution">
                            <strong>Institución:</strong> ${this.escapeHtml(cert.institution)}
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div class="certificate-header">
                        <div class="certificate-content">
                            <span class="certificate-type">${typeText}</span>
                            <h3 class="certificate-title">${this.escapeHtml(cert.title || 'Sin título')}</h3>
                            <p class="certificate-description">Certificado oficial del XXIV Seminario ALAEITS 2025</p>
                        </div>
                    </div>

                    ${metaHtml}
                    ${institutionHtml}

                    <div class="certificate-actions">
                        <button onclick="window.certificadosSystem.openPDFModal('${this.getPDFPreviewUrl(cert.pdf_url)}')" class="btn-view">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                            </svg>
                            Ver Certificado
                        </button>
                        <button onclick="window.certificadosSystem.downloadPDF('${this.escapeHtml(cert.pdf_url)}', '${this.escapeHtml(cert.paper_id || 'ALAEITS2025')}')" class="btn-download">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            Descargar PDF
                        </button>
                    </div>
                `;

                container.appendChild(card);
            });
        }

        getTipoCertificado(paperId, certificateType) {
            // Si es oyente
            if (certificateType === 'attendee' || !paperId) {
                return { tipo: 'Asistencia', eje: 'Oyente' };
            }

            // Si es simposio
            if (certificateType === 'symposium' || (paperId && paperId.toUpperCase().startsWith('SIM'))) {
                return { tipo: 'Simposio', eje: 'Participación en Simposio' };
            }

            // Si es ponente
            const prefix = paperId.charAt(0).toUpperCase();
            const tipos = {
                'P': { tipo: 'Ponencia', eje: 'Ponencia de Investigación' },
                'E': { tipo: 'Presentación', eje: 'Presentación Oral' },
                'Z': { tipo: 'Ponencia', eje: 'Ponencia Especial' },
                'O': { tipo: 'Ponencia', eje: 'Ponencia Organizativa' }
            };
            return tipos[prefix] || { tipo: 'Ponencia', eje: 'Ponencia General' };
        }

        formatDate(dateString) {
            if (!dateString) return 'No disponible';
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            } catch (e) {
                return 'No disponible';
            }
        }

        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        handleLogout() {
            this.currentCertificates = [];
            this.currentUserData = null;
            sessionStorage.removeItem('certificados_data');

            const loginView = document.getElementById('login-view');
            const documentView = document.getElementById('document-view');

            if (documentView) {
                documentView.style.display = 'none';
                documentView.classList.add('hidden');
            }
            if (loginView) {
                loginView.style.display = 'block';
                loginView.classList.remove('hidden');
            }

            // Limpiar formulario
            const paperIdInput = document.getElementById('paper-id');
            const emailInput = document.getElementById('email');

            if (paperIdInput) paperIdInput.value = '';
            if (emailInput) emailInput.value = '';

            this.hideError();
            window.scrollTo(0, 0);
        }

        showError(message) {
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) {
                errorDiv.textContent = message;
                errorDiv.style.display = 'block';
            }
        }

        hideError() {
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
            }
        }

        setLoadingState(loading) {
            this.isProcessing = loading;

            const loginBtn = document.getElementById('login-btn');
            const btnText = document.getElementById('login-btn-text');
            const btnSpinner = document.getElementById('login-btn-spinner');

            if (!loginBtn || !btnText || !btnSpinner) {
                return;
            }

            if (loading) {
                loginBtn.disabled = true;
                btnText.textContent = 'Verificando...';
                btnSpinner.classList.remove('hidden');
            } else {
                loginBtn.disabled = false;
                btnText.textContent = 'Acceder';
                btnSpinner.classList.add('hidden');
            }
        }

        // Convertir URL de Google Drive para preview en iframe
        getPDFPreviewUrl(url) {
            if (!url) return '';
            // Convertir de /view a /preview para que funcione en iframe
            return url.replace('/view?usp=drivesdk', '/preview');
        }

        // Convertir URL de Google Drive para descarga directa
        getPDFDownloadUrl(url) {
            if (!url) return '';

            // Extraer el FILE_ID de la URL de Google Drive
            // Formato: https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk
            const match = url.match(/\/d\/([^\/]+)/);
            if (match && match[1]) {
                const fileId = match[1];
                // Formato de descarga directa de Google Drive
                return `https://drive.google.com/uc?export=download&id=${fileId}`;
            }

            // Si no es Google Drive, retornar URL original
            return url;
        }

        // Abrir modal de PDF
        openPDFModal(pdfUrl) {
            const modal = document.getElementById('pdf-modal');
            const iframe = document.getElementById('pdf-iframe');

            if (!modal || !iframe) {
                return;
            }

            iframe.src = pdfUrl;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';

            // Prevenir scroll del body
            document.body.style.overflow = 'hidden';
        }

        // Cerrar modal de PDF
        closePDFModal() {
            const modal = document.getElementById('pdf-modal');
            const iframe = document.getElementById('pdf-iframe');

            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }

            if (iframe) {
                iframe.src = ''; // Limpiar iframe
            }

            // Restaurar scroll del body
            document.body.style.overflow = '';
        }

        // Descargar PDF directamente
        async downloadPDF(pdfUrl, paperId = 'ALAEITS2025') {
            if (!pdfUrl) {
                return;
            }

            // Registrar la descarga antes de descargar
            await this.trackDownload(paperId);

            // Convertir a URL de descarga directa
            const downloadUrl = this.getPDFDownloadUrl(pdfUrl);

            // Crear un enlace temporal y hacer clic en él
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `Certificado_${paperId}.pdf`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            // Agregar al DOM temporalmente
            document.body.appendChild(link);

            // Hacer clic
            link.click();

            // Remover del DOM
            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
        }

        // Registrar descarga en la base de datos
        async trackDownload(paperId) {
            try {
                if (!this.currentUserData || !this.currentUserData.author_email) {
                    return;
                }

                // Determinar el tipo de certificado
                const isAttendee = !paperId || paperId === 'ALAEITS2025';
                const type = isAttendee ? 'attendee' : 'presenter';

                const url = `${this.apiBaseUrl}/api/certificates/track-download`;

                await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: type,
                        paperId: paperId || '',
                        email: this.currentUserData.author_email
                    })
                });

                // No mostramos error si falla el tracking, solo registramos en consola
            } catch (error) {
                console.log('No se pudo registrar la descarga:', error);
            }
        }
    }

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.certificadosSystem = new CertificadosAPISystem();
        });
    } else {
        window.certificadosSystem = new CertificadosAPISystem();
    }

})();
