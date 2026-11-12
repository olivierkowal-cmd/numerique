/* Studio — page parents/profs et consentement IA (Studio.content.parents) */
window.Studio = window.Studio || {};
Studio.content = Studio.content || {};
(function () {
  var P = {
    titre: 'Pour les parents et les enseignants',
    sections: [
      {
        titre: 'À quoi sert Studio ?',
        texte: 'Studio aide les élèves de 1re secondaire à réviser. L’élève dépose un cours, une photo de son cahier ou du texte. Studio en tire des cartes et des jeux. Les chapitres et les exercices du cours sont aussi sur cette plateforme. Les séances sont courtes. Il n’y a ni classement public, ni note, ni compteur qui punit.'
      },
      {
        titre: 'Où restent les données ?',
        texte: 'L’élève se connecte avec son adresse mail de l’école. Ses cartes, ses points et sa série sont gardés dans le navigateur, puis sauvegardés dans l’espace Google de l’école (celui de l’enseignant), pour les retrouver sur un autre appareil. L’enseignant voit la progression : prénom, nom, classe, points, niveau, série, exercices faits. Il n’y a ni publicité ni outil de mesure. Rien n’est envoyé ailleurs, sauf si l’IA est activée (voir plus bas). On peut aussi exporter ses données dans un fichier.'
      },
      {
        titre: 'Que fait la clé IA ?',
        texte: 'La clé IA est facultative. Elle relie Studio à un service d’intelligence artificielle choisi par l’adulte. Studio fonctionne très bien sans elle, avec des méthodes simples sur l’appareil. Avec une clé, des résultats plus riches sont possibles : meilleures cartes et réponses.'
      },
      {
        titre: 'Qui doit activer l’IA ?',
        texte: 'Un adulte, et seulement un adulte. C’est lui qui choisit le fournisseur, qui saisit la clé et qui accepte les conditions. L’élève ne le fait pas seul. L’IA est désactivée par défaut. Si vous êtes enseignant, vérifiez d’abord ce que permet votre école. Si vous êtes parent, c’est vous qui en êtes responsable.'
      },
      {
        titre: 'Que se passe-t-il quand l’IA est activée ?',
        texte: 'Les extraits de cours ou les questions utilisés pour une activité sont envoyés au fournisseur choisi, via Internet. Ses règles s’appliquent alors, y compris sur la conservation des données. La clé est enregistrée dans le navigateur de l’appareil. Il vaut mieux ne pas mettre de données personnelles dans les cours (nom, adresse, téléphone). L’adulte peut retirer la clé à tout moment dans les Réglages.'
      },
      {
        titre: 'Consentement',
        texte: 'L’IA est désactivée par défaut. Elle ne s’active que si un adulte ajoute une clé et accepte. L’élève confirme ensuite à l’écran de consentement. L’âge du consentement numérique est de 13 ans en Belgique, 15 ans en France et 14 ans au Québec. En dessous de cet âge, un parent doit consentir. Ces âges sont à faire valider pour votre situation. En cas de doute, la clé IA reste gérée par un adulte.'
      },
      {
        titre: 'Conditions des fournisseurs d’IA',
        texte: 'Chaque fournisseur a ses propres règles, et elles changent. Voici ce que nous avons lu (consulté le 1er novembre 2026). Google : l’API Gemini exige 18 ans et interdit les applications susceptibles d’être utilisées par des moins de 18 ans. Anthropic : les comptes grand public demandent 18 ans. Son API peut toutefois servir des mineurs si l’organisation met en place des garde-fous et informe que c’est une IA. OpenAI : conditions non vérifiées. Ces points peuvent être mal compris ou dépassés. Fais valider par ton école avant d’activer l’IA avec des élèves. Lis toujours les conditions du fournisseur que tu choisis.',
        points: [
          'Google (API Gemini) : 18 ans exigés. Applications susceptibles d’être utilisées par des moins de 18 ans interdites.',
          'Anthropic : 18 ans pour les comptes grand public. L’API peut servir des mineurs si des garde-fous existent et si l’on informe que c’est une IA.',
          'OpenAI : conditions non vérifiées.',
          'Consulté le 1er novembre 2026. Fais valider par ton école.'
        ]
      },
      {
        titre: 'Les limites de l’IA',
        texte: 'Une IA peut se tromper, même si sa réponse semble sûre. Studio indique l’extrait du cours qui sert de source. L’élève peut signaler une carte douteuse. Conseil : relire avec le cours ou le manuel. En cas de doute, demander à l’enseignant. Studio ne remplace pas le cours.'
      },
      {
        titre: 'Les photos de cahier',
        texte: 'La photo est lue dans le navigateur. Elle n’est pas envoyée sur Internet. Le texte reconnu peut contenir des erreurs : l’élève peut le corriger avant de l’enregistrer. Attention : l’outil de lecture a besoin d’être téléchargé la première fois. Voir la section suivante.'
      },
      {
        titre: 'Ce qui se télécharge depuis internet',
        texte: 'Même sans IA, deux choses viennent d’Internet. 1) À la première lecture d’une photo, l’outil de lecture (Tesseract) et ses fichiers de langue sont téléchargés depuis des serveurs externes (CDN). Il faut alors une connexion. 2) Si l’option de police adaptée (dyslexie) est choisie, les polices viennent de Google Fonts. Ces serveurs peuvent voir l’adresse Internet de l’appareil, comme pour tout site. Ce sont des téléchargements : ton cours et tes photos ne partent pas.',
        points: [
          'Outil de lecture Tesseract et fichiers de langue : CDN externes, à la première utilisation.',
          'Polices adaptées (dyslexie) : Google Fonts, seulement si l’option est choisie.',
          'Aucune télémétrie.'
        ]
      },
      {
        titre: 'Retirer ton accord et effacer',
        texte: 'Tu peux changer d’avis quand tu veux. Dans les Réglages, retire la clé IA : l’IA s’arrête tout de suite. Le bouton « Effacer mes données » supprime les cours, les cartes et la progression de cet appareil (la sauvegarde de l’école est remplacée à la synchronisation suivante). C’est définitif. Tu peux d’abord exporter une copie dans un fichier. Vider les données du site dans le navigateur a le même effet. Attention : ce qui a déjà été envoyé à un fournisseur d’IA reste soumis à ses règles. Pour le faire effacer, il faut s’adresser à lui.'
      },
      {
        titre: 'Aide et urgences',
        texte: 'Si tu vas mal ou si tu t’inquiètes pour quelqu’un, parle à un adulte de confiance. Ces services écoutent aussi. Belgique : 103 Écoute-Enfants, gratuit, de 10 h à minuit, 7 jours sur 7, par téléphone ou chat. La nuit, en cas d’urgence : 112. Québec : Jeunesse, J’écoute, 1 800 668-6868, ou texto PARLER au 686868. Urgence : 911. France : 3114 (24 h sur 24) et 119 (24 h sur 24). Urgence : 112.',
        liens: [
          { nom: 'Belgique : 103 Écoute-Enfants', tel: '103', horaires: 'Gratuit, 10 h à minuit, 7 j/7, chat. La nuit : 112', url: 'https://www.103ecoute.be' },
          { nom: 'Québec : Jeunesse, J’écoute', tel: '1 800 668-6868', horaires: 'Texto : PARLER au 686868. Urgence : 911', url: 'https://jeunessejecoute.ca' },
          { nom: 'France : 3114 et 119', tel: '3114 / 119', horaires: '24 h sur 24 (les deux). Urgence : 112', url: 'https://www.allo119.gouv.fr' }
        ]
      },
      {
        titre: 'Contact et aide',
        texte: 'Un souci, une question, une idée ? Parlez-en à la personne qui vous a donné accès à Studio. Si Studio ne répond plus, rechargez la page. Les données sont sauvegardées dans l’espace Google de l’école. Pensez à exporter une copie de temps en temps.'
      }
    ],

    // Écran de consentement IA : version adulte en premier, puis version élève (12-13 ans).
    consent: {
      titre: 'Activer l’IA ?',
      ordre: ['adulte', 'eleve'],
      adulte: {
        titre: 'Activation de l’IA : information et accord de l’adulte',
        texte: [
          'Cette étape est réservée à un adulte. Il en est responsable.',
          'L’IA est désactivée par défaut. Studio fonctionne sans elle, sur l’appareil.',
          'Si vous l’activez, des extraits de cours et des questions sont envoyés au fournisseur que vous avez choisi. Ses conditions s’appliquent.',
          'Les conditions des fournisseurs varient. Certains exigent 18 ans. Lisez-les avant d’accepter. En milieu scolaire, faites valider par l’école.',
          'L’âge du consentement numérique est de 13 ans en Belgique, 15 ans en France et 14 ans au Québec. En dessous, un parent doit consentir.',
          'Même sans IA, la lecture de photos télécharge un outil depuis Internet à la première utilisation.',
          'La clé est stockée dans le navigateur de cet appareil. Vous pouvez la retirer à tout moment dans les Réglages.',
          'Une IA peut se tromper. L’élève est invité à vérifier avec son cours.'
        ],
        boutonOui: 'J’ai lu, je suis adulte et j’active l’IA',
        boutonNon: 'Garder l’IA désactivée'
      },
      eleve: {
        titre: 'Tu veux activer l’IA ?',
        texte: [
          'L’IA peut créer de meilleures cartes.',
          'Pour ça, des morceaux de ton cours partent par Internet.',
          'Sans l’IA, Studio marche très bien. Aucune IA ne reçoit ton cours.',
          'Une IA peut se tromper. Vérifie avec ton cours.',
          'Un adulte doit d’abord dire oui. Tu peux arrêter quand tu veux.'
        ],
        boutonOui: 'Oui, un adulte est d’accord',
        boutonNon: 'Non, merci'
      }
    }
  };

  Studio.content.parents = P;
})();
