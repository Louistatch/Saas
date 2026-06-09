-- Templates SMS pour les événements clés de la plateforme
-- Utilisés par /api/cron/notifications via Africa's Talking

INSERT INTO public.notification_templates (key, channel, subject, body_fr)
VALUES
  ('enrollment_welcome', 'sms', 'Bienvenue FaîtiereHub',
   'Bienvenue {prenom} ! Votre carte FaîtiereHub est active : {card_number}. Vérifiez votre profil : https://www.faitierehub.com/verify/{card_number}'),

  ('cotisation_paid', 'sms', 'Cotisation reçue',
   'Bonjour {prenom}, votre cotisation de {montant} FCFA a bien été reçue. Merci !'),

  ('cotisation_overdue', 'sms', 'Cotisation en retard',
   'Bonjour {prenom}, votre cotisation de {montant} FCFA est en retard depuis le {date_echeance}. Veuillez régulariser.'),

  ('ats_level_up', 'sms', 'Niveau amélioré',
   'Félicitations {prenom} ! Vous avez atteint le niveau {niveau} sur FaîtiereHub. Continuez comme ça !'),

  ('new_fiche_available', 'sms', 'Nouvelle fiche technique',
   'Bonjour {prenom}, une nouvelle fiche technique "{titre}" est disponible sur FaîtiereHub pour {culture}.')

ON CONFLICT (key) DO UPDATE SET
  body_fr = EXCLUDED.body_fr,
  subject = EXCLUDED.subject;
