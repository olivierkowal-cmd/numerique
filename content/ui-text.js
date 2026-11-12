/* Studio — textes d'interface (Studio.content.text) */
window.Studio = window.Studio || {};
Studio.content = Studio.content || {};
(function () {
  var T = {};

  // Onboarding : 4 écrans
  T.onboarding = [
    {
      emoji: '👋',
      titre: 'Bienvenue sur Studio !',
      texte: 'Studio t’aide à réviser sans te prendre la tête. Tu déposes ton cours. Il te prépare des cartes et des jeux. Tes données sont sauvegardées sur la plateforme de ton école.'
    },
    {
      emoji: '📚',
      titre: 'Dépose ton cours',
      texte: 'Ajoute un fichier, une photo de ton cahier ou ton texte. Pas de cours sous la main ? Essaie le cours d’exemple.'
    },
    {
      emoji: '✨',
      titre: 'Choisis comment réviser',
      texte: 'Cartes, jeux, astuces, carte mentale… Choisis ce que tu préfères. Une clé IA est possible, mais pas obligatoire. Studio marche très bien sans.'
    },
    {
      emoji: '🔥',
      titre: 'Un peu chaque jour',
      texte: 'Cinq minutes par jour, c’est mieux qu’une grosse séance la veille. Studio te dit quoi revoir. Prêt·e ? On y va !'
    }
  ];
  T.onboardingBoutons = { suivant: 'Suivant', precedent: 'Retour', passer: 'Passer', commencer: 'Commencer' };

  // 30 astuces du jour
  T.tips = [
    'Relire ne suffit pas. Ferme ton cours et essaie de te rappeler ce que tu as appris.',
    'Dix minutes par jour valent souvent mieux qu’une longue séance la veille.',
    'Explique une notion à voix haute, comme à un ami. Là où tu bloques, il reste à revoir.',
    'Dors bien après avoir révisé. Pendant la nuit, ton cerveau range ce que tu as appris.',
    'Une erreur n’est pas un échec. C’est l’endroit où tu peux progresser.',
    'Commence par le plus difficile, quand tu as encore de l’énergie.',
    'Mets ton téléphone dans une autre pièce. Tu te concentreras plus facilement.',
    'Fais une pause de 5 minutes après 25 minutes de travail. Bouge, bois de l’eau.',
    'Un schéma, même moche, aide à retenir. Souvent mieux qu’un long paragraphe.',
    'Invente une phrase avec les initiales d’une liste. Ça s’appelle un acrostiche.',
    'Range les infos par paquets de 3 à 5. C’est plus facile à garder en tête.',
    'Avant de commencer, note ton objectif : « Aujourd’hui, je révise le chapitre 3 ».',
    'Mélange les types d’exercices. C’est plus dur, mais très utile pour un contrôle.',
    'Pose-toi des questions sur ton cours, comme ferait ton prof.',
    'Relie ce que tu apprends à ce que tu sais déjà. Plus il y a de liens, mieux c’est.',
    'Les cartes que tu rates reviennent bientôt. C’est fait exprès : ça t’aide à les retenir.',
    'Relis ta leçon le soir. Le lendemain matin, teste-toi.',
    'Bois de l’eau et mange un petit quelque chose avant de réviser. Ton cerveau en a besoin.',
    'Invente des images drôles ou bizarres. On les retient mieux que les idées sages.',
    'Réviser à deux, c’est chouette. Mais pose-toi vraiment des questions entre vous.',
    'Dès que tu connais la date du contrôle, prépare ton planning.',
    'À la fin d’une séance, résume en 3 phrases ce que tu as retenu.',
    'Utilise une couleur par thème. Pas pour faire joli, mais pour t’y retrouver.',
    'Surligne les mots-clés, pas des phrases entières. Tout surligner, c’est ne rien surligner.',
    'Raconte un chapitre d’histoire comme une histoire : qui, quoi, quand, pourquoi.',
    'Lis un passage à voix haute. Entendre ta voix aide beaucoup de monde.',
    'Tu bloques ? Fais autre chose cinq minutes, puis reviens. Ça marche souvent.',
    'Teste-toi avant d’avoir tout révisé : une carte oubliée te montre où mettre ton énergie.',
    'Bravo après chaque séance, même courte ! Continuer, c’est ça le plus important.',
    'Ne te compare pas aux autres. Compare-toi à toi-même, la semaine dernière.'
  ];

  // Messages d'encouragement selon le score (pourcentage 0-100)
  T.encouragement = {
    parfait: [
      'Sans faute ! Bravo, tout est bien en place.',
      '100 % ! Tu peux être fier·ère de toi.',
      'Parfait ! Reviens-y dans quelques jours pour que ça reste bien en tête.'
    ],
    excellent: [
      'Excellent ! Tu maîtrises presque tout.',
      'Très bien joué ! Jette un œil aux quelques erreurs et c’est gagné.',
      'Beau score ! Tes révisions portent leurs fruits.'
    ],
    bien: [
      'Bon travail ! Tu as de bonnes bases. Continue comme ça.',
      'Pas mal du tout ! Quelques points à revoir et ce sera encore mieux.',
      'Tu es sur la bonne voie. Regarde la correction pour progresser.'
    ],
    moyen: [
      'C’est un bon début ! Lis la correction, puis réessaie un peu plus tard.',
      'Tu as déjà compris une bonne partie. Reprends les questions ratées.',
      'Pas de panique : on apprend en se trompant. Tu peux recommencer quand tu veux.'
    ],
    faible: [
      'Ce n’est pas grave, ça arrive à tout le monde. Reprends le cours tranquillement.',
      'Courage ! Essaie les cartes pour revoir les bases.',
      'Chaque essai te rapproche du but. Un pas après l’autre, tu vas y arriver.'
    ]
  };

  // Retourne un message adapté au score (pourcentage 0-100)
  T.encourage = function (pct) {
    var p = Number(pct);
    if (!isFinite(p)) p = 0;
    var k = p >= 100 ? 'parfait' : p >= 85 ? 'excellent' : p >= 65 ? 'bien' : p >= 40 ? 'moyen' : 'faible';
    var arr = T.encouragement[k];
    return arr[Math.floor(Math.random() * arr.length)];
  };

  // Astuce du jour : stable pour une même journée
  T.tipOfDay = function (date) {
    var d = date || new Date();
    var start = new Date(d.getFullYear(), 0, 0);
    var day = Math.floor((d - start) / 86400000);
    return T.tips[day % T.tips.length];
  };

  // États vides par module
  T.empty = {
    library: {
      icon: '📚',
      title: 'Ta bibliothèque est vide',
      text: 'Ajoute un cours ou colle ton texte pour commencer. Tu peux aussi essayer le cours d’exemple.',
      cta: 'Ajouter un cours'
    },
    dashboard: {
      icon: '📊',
      title: 'Pas encore de statistiques',
      text: 'Fais ta première révision. Ton tableau de bord se remplira tout seul.',
      cta: 'Commencer à réviser'
    },
    flashcards: {
      icon: '🃏',
      title: 'Pas encore de cartes',
      text: 'Crée un paquet de cartes à partir d’un cours. Elles reviennent au bon moment.',
      cta: 'Créer des cartes'
    },
    memory: {
      icon: '🎮',
      title: 'Rien à jouer pour l’instant',
      text: 'Crée d’abord des cartes à partir d’un cours. Les jeux utilisent leurs paires.',
      cta: 'Créer des cartes'
    },
    mnemo: {
      icon: '💡',
      title: 'Aucune astuce pour l’instant',
      text: 'Studio peut te proposer des mots-codes, des histoires et des rimes pour retenir ton cours.',
      cta: 'Trouver des astuces'
    },
    mindmap: {
      icon: '🕸️',
      title: 'Pas encore de carte mentale',
      text: 'Crée une carte pour voir comment les idées de ton cours sont reliées.',
      cta: 'Créer une carte'
    },
    chat: {
      icon: '💬',
      title: 'Pose ta première question',
      text: 'Choisis un cours, puis demande ce que tu veux. Une définition, une date, une explication.',
      cta: 'Choisir un cours'
    },
    methods: {
      icon: '🧭',
      title: 'Aucune méthode à afficher',
      text: 'Les fiches méthodes ne se sont pas chargées. Recharge la page.',
      cta: 'Recharger'
    },
    noDocSelected: {
      icon: '👆',
      title: 'Choisis d’abord un cours',
      text: 'Cette activité a besoin d’un cours. Choisis-en un dans ta bibliothèque.',
      cta: 'Aller à la bibliothèque'
    },
    search: {
      icon: '🔍',
      title: 'Aucun résultat',
      text: 'Essaie avec d’autres mots.',
      cta: ''
    },
    noDue: {
      icon: '🎉',
      title: 'Rien à revoir pour l’instant',
      text: 'Tu es à jour, bravo ! Reviens plus tard, tes cartes reviendront au bon moment.',
      cta: ''
    }
  };

  // Libellés d'aide (info-bulles, aides contextuelles)
  T.help = {
    spacedRepetition: 'Tu revois une carte juste avant de l’oublier. Plus tu réussis, plus l’attente s’allonge.',
    ratingAgain: 'À revoir : tu ne t’en souvenais pas. La carte revient vite.',
    ratingHard: 'Difficile : tu as trouvé, mais avec peine. La carte revient assez vite.',
    ratingGood: 'Bien : tu as trouvé sans trop d’effort. La carte revient plus tard.',
    ratingEasy: 'Facile : c’était évident. La carte revient bien plus tard.',
    flipCard: 'Clique sur la carte ou appuie sur Espace pour la retourner.',
    keyboard: 'Raccourcis : Espace pour retourner, 1 à 4 pour noter, Échap pour fermer.',
    streak: 'Ta série compte les jours où tu as révisé. Si tu en rates un, on repart sans souci.',
    xp: 'Les points d’expérience (XP) récompensent ton travail. Ils ne comptent pas pour tes notes.',
    apiKey: 'Facultatif. Avec une clé, Studio utilise une IA et tes textes lui sont envoyés. Sans clé, rien ne part de ton appareil.',
    noApiKey: 'Sans clé, Studio travaille sur ton appareil avec des méthodes simples. C’est moins fin qu’avec une IA, mais ça marche bien.',
    privacy: 'Tes cours et ta progression sont dans ton navigateur et sauvegardés sur la plateforme de ton école.',
    exportData: 'Enregistre une copie de tes données dans un fichier, pour la garder ou la déplacer.',
    clearData: 'Attention : ça efface tes cours et ta progression sur cet appareil.',
    upload: 'Formats possibles : PDF, Word (.docx), texte, Markdown et page web (.html).',
    pdfScan: 'Ton PDF est une photo ? Studio ne peut pas lire le texte. Essaie un PDF où tu peux sélectionner les mots.',
    cdnOffline: 'Pour lire les PDF et les fichiers Word, Studio a besoin d’internet. Vérifie ta connexion ou colle ton texte.',
    theme: 'Choisis le thème clair, le thème sombre, ou laisse Studio suivre ton appareil.',
    chatSources: 'Les extraits viennent de ton cours. Tu peux vérifier d’où vient la réponse.',
    aiWarning: 'Une IA peut se tromper. Compare toujours avec ton cours.'
  };

  Studio.content.text = T;
})();
