-- AgriAcademy : la formation Opérateur ne s'appelle plus « … — Pilote V1 » devant les candidats.
-- Ne change que ce titre (idempotente) ; contenu, leçons et progression intacts.
update public.academy_modules
set title = 'Opérateur certifié FaîtiereHub'
where id = '2482e523-500e-4178-8102-1018af290c82'
  and title <> 'Opérateur certifié FaîtiereHub';
