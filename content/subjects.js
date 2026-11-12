/* Studio — contenus par matière, badges, quêtes, coachs (Studio.content.subjects) */
window.Studio = window.Studio || {};
Studio.content = Studio.content || {};
(function () {
  function P(front, back) { return { front: front, back: back }; }

  var S = {};

  // Listes d'exemple. Chaque paire = { front, back } (même forme que les cartes).
  S.samples = {
    vocab: [
      {
        id: 'vocab-en', titre: 'Anglais : la vie de tous les jours', langue: 'en',
        paires: [
          P('le chat', 'the cat'), P('la maison', 'the house'), P('l’école', 'the school'),
          P('le livre', 'the book'), P('l’eau', 'the water'), P('l’ami', 'the friend'),
          P('manger', 'to eat'), P('boire', 'to drink'), P('dormir', 'to sleep'),
          P('rouge', 'red'), P('grand', 'big'), P('aujourd’hui', 'today'),
          P('la pomme', 'the apple'), P('le chien', 'the dog'), P('la famille', 'the family')
        ]
      },
      {
        id: 'vocab-nl', titre: 'Néerlandais : les premiers mots', langue: 'nl',
        paires: [
          P('le chat', 'de kat'), P('la maison', 'het huis'), P('l’école', 'de school'),
          P('le livre', 'het boek'), P('l’eau', 'het water'), P('l’ami', 'de vriend'),
          P('manger', 'eten'), P('boire', 'drinken'), P('dormir', 'slapen'),
          P('rouge', 'rood'), P('grand', 'groot'), P('aujourd’hui', 'vandaag'),
          P('la pomme', 'de appel'), P('le chien', 'de hond'), P('la famille', 'de familie')
        ]
      },
      {
        id: 'vocab-es', titre: 'Espagnol : les premiers mots', langue: 'es',
        paires: [
          P('le chat', 'el gato'), P('la maison', 'la casa'), P('l’école', 'la escuela'),
          P('le livre', 'el libro'), P('l’eau', 'el agua'), P('l’ami', 'el amigo'),
          P('manger', 'comer'), P('boire', 'beber'), P('dormir', 'dormir'),
          P('rouge', 'rojo'), P('grand', 'grande'), P('aujourd’hui', 'hoy'),
          P('la pomme', 'la manzana'), P('le chien', 'el perro'), P('la famille', 'la familia')
        ]
      }
    ],

    dates: [
      {
        id: 'dates-histoire', titre: 'Dates d’histoire à connaître',
        paires: [
          P('476', 'Fin de l’Empire romain d’Occident'),
          P('800', 'Charlemagne est couronné empereur'),
          P('1066', 'Bataille d’Hastings : Guillaume le Conquérant devient roi d’Angleterre'),
          P('1492', 'Christophe Colomb arrive en Amérique'),
          P('1534', 'Jacques Cartier arrive à Gaspé'),
          P('1608', 'Samuel de Champlain fonde Québec'),
          P('1789', 'Prise de la Bastille, début de la Révolution française'),
          P('1830', 'Indépendance de la Belgique'),
          P('1914', 'Début de la Première Guerre mondiale'),
          P('1918', 'Fin de la Première Guerre mondiale'),
          P('1945', 'Fin de la Seconde Guerre mondiale'),
          P('1969', 'Premiers pas d’un humain sur la Lune')
        ]
      }
    ],

    definitions: [
      {
        id: 'def-sciences-geo', titre: 'Sciences et géographie : 12 mots-clés',
        paires: [
          P('Photosynthèse', 'Les plantes fabriquent leur nourriture avec la lumière, l’eau et le gaz carbonique.'),
          P('Cellule', 'La plus petite unité du vivant.'),
          P('Atome', 'Un tout petit grain de matière. Tout ce qui nous entoure en est fait.'),
          P('Évaporation', 'Passage de l’eau liquide à l’état de gaz, la vapeur d’eau.'),
          P('Condensation', 'Passage de la vapeur d’eau à l’état liquide, en gouttelettes.'),
          P('Écosystème', 'Un milieu de vie avec les êtres vivants qui y habitent et leurs relations.'),
          P('Herbivore', 'Un animal qui mange surtout des plantes.'),
          P('Carnivore', 'Un animal qui mange surtout de la viande.'),
          P('Équateur', 'Ligne imaginaire qui partage la Terre en deux : hémisphère Nord et hémisphère Sud.'),
          P('Latitude', 'Distance d’un lieu par rapport à l’équateur, mesurée en degrés.'),
          P('Longitude', 'Position d’un lieu à l’est ou à l’ouest du méridien de Greenwich.'),
          P('Volcan', 'Une montagne par où sortent de la lave, des cendres et des gaz venus du sous-sol.')
        ]
      }
    ]
  };

  // Badges. condition = { type, cible } ; les types suivent les événements « activity ».
  S.badges = [
    { id: 'premiere-etincelle', nom: 'Première étincelle', description: 'Tu as fini ta toute première activité.', emoji: '✨', condition: { type: 'activities', cible: 1 } },
    { id: 'cerveau-en-feu', nom: 'Cerveau en feu', description: 'Trois jours de suite, tu as révisé.', emoji: '🔥', condition: { type: 'streak', cible: 3 } },
    { id: 'semaine-solide', nom: 'Semaine solide', description: 'Sept jours de révision d’affilée.', emoji: '📆', condition: { type: 'streak', cible: 7 } },
    { id: 'carte-rois', nom: 'Roi des cartes', description: 'Tu as retourné 50 cartes.', emoji: '🃏', condition: { type: 'cards', cible: 50 } },
    { id: 'chasseur-cartes', nom: 'Chasseur de cartes', description: 'Tu as créé ton premier paquet de cartes.', emoji: '🎯', condition: { type: 'deck', cible: 1 } },
    { id: 'memoire-elephant', nom: 'Mémoire d’éléphant', description: 'Tu as gagné 3 parties de memory.', emoji: '🐘', condition: { type: 'memory', cible: 3 } },
    { id: 'rebond', nom: 'Le grand rebond', description: 'Tu es revenu·e après une pause. Bravo !', emoji: '🦘', condition: { type: 'comeback', cible: 1 } },
    { id: 'photographe', nom: 'Œil de lynx', description: 'Tu as photographié une page de ton cahier.', emoji: '📸', condition: { type: 'ocr', cible: 1 } },
    { id: 'bibliothecaire', nom: 'Petit bibliothécaire', description: 'Tu as ajouté 3 cours dans ta bibliothèque.', emoji: '📚', condition: { type: 'import', cible: 3 } },
    { id: 'cinq-minutes', nom: 'Cinq minutes chrono', description: 'Tu as fini une séance de 5 minutes.', emoji: '⏱️', condition: { type: 'today', cible: 1 } },
    { id: 'artiste-cartes', nom: 'Artiste des idées', description: 'Tu as créé une carte mentale.', emoji: '🎨', condition: { type: 'mindmap', cible: 1 } },
    { id: 'inventeur', nom: 'Inventeur d’astuces', description: 'Tu as trouvé une astuce pour retenir ton cours.', emoji: '💡', condition: { type: 'mnemo', cible: 1 } },
    { id: 'tirelire', nom: 'Tirelire pleine', description: 'Tu as gagné 100 pièces.', emoji: '💰', condition: { type: 'coins', cible: 100 } },
    { id: 'niveau-cinq', nom: 'Étoile montante', description: 'Tu as atteint le niveau 5.', emoji: '🚀', condition: { type: 'level', cible: 5 } },
    { id: 'zero-stress', nom: 'Zen avant le contrôle', description: 'Tu as révisé la veille d’un contrôle.', emoji: '🧘', condition: { type: 'controle', cible: 1 } }
  ];

  // Modèles de quêtes. type = type d'activité (événement « activity »), cible = nombre à atteindre.
  S.quests = [
    { id: 'q-cards-10', texte: 'Retourne 10 cartes.', type: 'cards', cible: 10 },
    { id: 'q-cards-20', texte: 'Retourne 20 cartes.', type: 'cards', cible: 20 },
    { id: 'q-memory-1', texte: 'Joue une partie de memory.', type: 'memory', cible: 1 },
    { id: 'q-mnemo-1', texte: 'Trouve une astuce pour retenir un mot.', type: 'mnemo', cible: 1 },
    { id: 'q-mindmap-1', texte: 'Crée une carte mentale.', type: 'mindmap', cible: 1 },
    { id: 'q-import-1', texte: 'Ajoute un nouveau cours.', type: 'import', cible: 1 },
    { id: 'q-ocr-1', texte: 'Prends une page de cahier en photo.', type: 'ocr', cible: 1 },
    { id: 'q-today-1', texte: 'Fais ta séance de 5 minutes.', type: 'today', cible: 1 },
    { id: 'q-any-3', texte: 'Fais trois activités, peu importe lesquelles.', type: 'activities', cible: 3 },
    { id: 'q-cards-5', texte: 'Retourne seulement 5 cartes. C’est déjà bien !', type: 'cards', cible: 5 }
  ];

  // Phrases des coachs. Situations : start, good, bad, done, streak, comeback.
  S.coachLines = {
    max: {
      start: [
        'On commence tranquillement. Un petit pas à la fois.',
        'Respire. On y va ensemble.',
        'Plan du jour : simple et court. Prêt·e ?',
        'Une chose à la fois. C’est la meilleure méthode.',
        'Allez, on s’installe. Je suis là.'
      ],
      good: [
        'Bien joué. Tu gardes un bon rythme.',
        'Exactement. Continue comme ça.',
        'Voilà du travail propre.',
        'Tu y es. Je suis content de te voir progresser.',
        'Très bien. Pas besoin d’aller plus vite.'
      ],
      bad: [
        'Ce n’est pas grave. On regarde la réponse ensemble.',
        'Une erreur, c’est une info utile. On la garde.',
        'Respire. Cette carte reviendra, et tu seras prêt·e.',
        'Tout le monde passe par là. On continue.',
        'Pas de souci. Ton cerveau est en train d’apprendre.'
      ],
      done: [
        'Séance terminée. Tu peux être fier·ère.',
        'C’est fait. Prends une pause bien méritée.',
        'Beau travail aujourd’hui. À bientôt !',
        'Mission accomplie. Repose-toi un peu.',
        'Voilà qui est fait. Demain, on continue tranquillement.'
      ],
      streak: [
        'Plusieurs jours de suite. C’est solide.',
        'Ta série grandit. Belle régularité.',
        'Jour après jour, tu construis quelque chose.',
        'Régulier, calme, efficace. J’aime ça.',
        'Ta série continue. Sans pression, tu fais ça très bien.'
      ],
      comeback: [
        'Content de te revoir. On reprend doucement.',
        'Bon retour. Rien n’est perdu.',
        'Une pause, ça arrive. On repart d’ici.',
        'Te voilà ! On commence par du facile.',
        'Bienvenue de nouveau. Un petit pas suffit.'
      ]
    },
    lea: {
      start: [
        'Qu’est-ce qu’on va découvrir aujourd’hui ? Moi, j’ai hâte !',
        'Une question pour commencer : que sais-tu déjà ?',
        'C’est parti pour l’enquête !',
        'Je me demande ce qu’on va apprendre de beau.',
        'Ouvre grand les yeux, on va trouver des trucs chouettes !'
      ],
      good: [
        'Oh, bien vu ! Comment tu as trouvé ça ?',
        'Waouh, exact ! Tu es un·e vrai·e détective.',
        'Super ! Et si on creusait encore un peu ?',
        'Ça, c’est une belle réponse !',
        'Bravo ! Tu as le déclic.'
      ],
      bad: [
        'Hmm, intéressant ! Pourquoi cette réponse, à ton avis ?',
        'Mystère ! Regardons la bonne réponse ensemble.',
        'Rien de grave, c’est comme ça qu’on découvre.',
        'Oh, cette carte est coquine ! On la reverra.',
        'Chouette, une occasion d’apprendre quelque chose !'
      ],
      done: [
        'Quelle belle exploration ! Qu’as-tu retenu de plus surprenant ?',
        'Terminé ! J’ai appris plein de choses avec toi.',
        'Super séance ! Raconte-la à quelqu’un.',
        'Enquête bouclée. À la prochaine !',
        'Waouh, déjà fini ! Quelle curiosité !'
      ],
      streak: [
        'Encore un jour ! Tu es très curieux·se.',
        'Ta série grandit. Jusqu’où iras-tu ?',
        'Chaque jour, une nouvelle découverte. J’adore.',
        'Wow, tu reviens chaque jour ! Quel est ton secret ?',
        'Ta série fait des petits. Bravo !'
      ],
      comeback: [
        'Te revoilà ! Tu m’as manqué. Qu’as-tu fait de beau ?',
        'Coucou ! Prêt·e à reprendre l’aventure ?',
        'Un petit tour, et on y retourne !',
        'Ça fait plaisir ! Allez, on explore.',
        'Quelle belle surprise ! On y va doucement ?'
      ]
    },
    theo: {
      start: [
        'Mode révision activé. Chargement… 100 %.',
        'Niveau 1 : on s’échauffe. Prêt·e ?',
        'Nouvelle partie. Pas besoin de manette, juste ton cerveau.',
        'C’est parti, on lance le programme.',
        'Cool. On démarre ça tranquille.'
      ],
      good: [
        'Critique ! Ça, c’est du bon code.',
        'GG ! Bien joué.',
        'Trop fort. Tu débloques un super pouvoir.',
        'Nickel, sans bug.',
        'Boom ! Exactement ça.'
      ],
      bad: [
        'Petit bug. Pas grave, on relance.',
        'Respawn ! Tu reviens plus fort·e.',
        'Erreur 404 : réponse introuvable. On la cherche ensemble.',
        'Même les pros ratent. On passe au niveau suivant.',
        'Aucun souci. On corrige, et c’est réglé.'
      ],
      done: [
        'Séance terminée. Sauvegarde automatique faite.',
        'Niveau terminé ! Tu peux souffler.',
        'GG, la séance est bouclée.',
        'Mission réussie. Pause bien méritée.',
        'Fin du niveau. Récompense : un goûter.'
      ],
      streak: [
        'Combo en cours ! Continue comme ça.',
        'Ta série, c’est ton score. Il monte !',
        'Combo ×3, ×4… Ça chauffe.',
        'Régulier comme un serveur bien réglé.',
        'Série activée. Bonus de cool.'
      ],
      comeback: [
        'Te revoilà ! On relance une partie ?',
        'Nouvelle session. Ta sauvegarde est intacte.',
        'Retour en jeu. Rien n’a disparu.',
        'Salut ! On reprend où tu t’étais arrêté·e.',
        'Pause finie. Tu es prêt·e pour le niveau suivant.'
      ]
    },
    zoe: {
      start: [
        'Prends tes crayons : on va colorier nos idées !',
        'Une page blanche, un cours, et de la créativité !',
        'Et si on révisait avec des dessins aujourd’hui ?',
        'C’est parti pour une séance haute en couleurs !',
        'Imagine ton cours comme un film. On commence !'
      ],
      good: [
        'Magnifique ! Cette réponse mérite un arc-en-ciel.',
        'Bravo ! Quel joli travail.',
        'Tu peins ça comme une artiste !',
        'Oh, ça brille ! Super réponse.',
        'Génial ! Garde cette image en tête.'
      ],
      bad: [
        'Oups, une tache sur le dessin ! On la transforme en fleur.',
        'Pas de souci. Invente une image rigolote pour t’en souvenir.',
        'Une erreur, c’est une couleur de plus sur ta palette.',
        'On efface, on redessine. Facile !',
        'Allez, imagine une histoire un peu folle pour cette réponse.'
      ],
      done: [
        'Quelle belle œuvre ! Séance terminée.',
        'Fini ! Ton cerveau a plein de nouvelles couleurs.',
        'Ta séance mérite un petit cadre.',
        'Bravo l’artiste. Repose tes pinceaux.',
        'Tout est rangé. À très vite !'
      ],
      streak: [
        'Jour après jour, ta fresque grandit. Superbe !',
        'Ta série, c’est un joli arc-en-ciel.',
        'Un nouveau trait de couleur chaque jour. J’adore.',
        'Ta série brille comme un feu d’artifice.',
        'Quelle belle collection de jours !'
      ],
      comeback: [
        'Te revoilà ! La toile t’attendait.',
        'Coucou ! On reprend les crayons ?',
        'Une pause, et hop, plein de nouvelles idées !',
        'Bon retour dans l’atelier.',
        'Ravie de te revoir. On colorie doucement ?'
      ]
    }
  };

  // Astuces selon l'âge (clé = âge ; « default » si l'âge est inconnu).
  S.tipsByAge = {
    '12': [
      'Commence par cinq minutes. Souvent, tu continues sans t’en rendre compte.',
      'Dessine une petite image à côté des mots difficiles.',
      'Révise à voix haute, comme si tu étais le prof.',
      'Prépare ton sac et ton bureau avant de commencer.',
      'Après ta séance, prends une vraie pause. Tu l’as bien méritée.'
    ],
    '13': [
      'Mets ton agenda à jour : note chaque contrôle dès que tu l’apprends.',
      'Découpe un gros chapitre en petits morceaux de 10 minutes.',
      'Teste-toi avant de relire. Tu verras ce qu’il reste à apprendre.',
      'Éteins les notifications pendant que tu révises.',
      'Entraîne-toi à expliquer un chapitre en trois phrases.'
    ],
    'default': [
      'Un peu chaque jour, c’est mieux qu’un gros effort au dernier moment.',
      'Ferme ton cours et essaie de t’en souvenir. C’est ça qui fait progresser.',
      'Une erreur, c’est un indice sur ce qu’il faut revoir.',
      'Bois de l’eau, bouge un peu, et reviens avec les idées claires.',
      'Tu avances à ton rythme. C’est ça, le bon rythme.'
    ]
  };

  // « Contrôle demain » : textes simples selon le nombre de jours avant le contrôle.
  S.controleDemain = {
    'J-3': 'Contrôle dans 3 jours. Tu as le temps ! Aujourd’hui, relis et révise tes cartes.',
    'J-2': 'Contrôle dans 2 jours. Reprends les cartes ratées et joue au memory.',
    'J-1': 'Contrôle demain. Fais un petit survol et une séance de cartes courte. Ensuite, repose-toi et dors bien.',
    'J0': 'Contrôle aujourd’hui. Respire, relis seulement tes mots-clés. Tu t’es bien préparé·e. Bonne chance !'
  };

  Studio.content.subjects = S;
})();
