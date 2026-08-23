# Private Echo

Vytvoř nový projekt pro moderní privacy-first secure messenger aplikaci.

Projekt zatím NEIMPLEMENTUJ jako obyčejný chat. Nejdříve vytvoř profesionální základní architekturu, která je od začátku navržena pro end-to-end encrypted komunikaci.

HLAVNÍ CÍL

Chci vytvořit bezpečný messenger inspirovaný principy aplikací jako Threema.

Bezpečnost musí být základní součást architektury, nikoliv funkce přidaná později.

ZÁSADNÍ BEZPEČNOSTNÍ PRINCIPY

Server nikdy nesmí znát plaintext obsahu zpráv.

Privátní kryptografické klíče nesmí být ukládány do Supabase databáze.

Kryptografické klíče musí být generovány na klientském zařízení.

Zprávy musí být zašifrovány před odesláním na server.

Server musí pracovat pouze s ciphertextem a minimem nutných metadat.

Nepoužívej vlastní vymyšlený kryptografický algoritmus.

Nepoužívej pouze jednoduché AES šifrování bez správného key managementu.

Kryptografická architektura musí být navržena tak, aby bylo možné později použít auditované a ověřené kryptografické knihovny/protokoly.

Každé zařízení uživatele musí mít vlastní kryptografickou identitu.

Navrhni architekturu pro forward secrecy a bezpečnou rotaci klíčů.

Navrhni ochranu proti MITM útokům a možnost ověřování identity kontaktu.

Minimalizuj ukládání osobních a provozních údajů.

Do databáze nikdy neukládej plaintext zpráv, kontaktů nebo příloh, pokud to není nezbytné.

Nepřidávej reklamní trackery ani third-party analytics, které by mohly narušovat privacy.

TECHNOLOGIE

Frontend:

React

TypeScript

moderní responsive UI

mobile-first design

Backend:

Supabase

PostgreSQL

Supabase Auth pouze tam, kde je vhodný

Supabase Realtime pro doručování událostí

Row Level Security pro všechny citlivé tabulky

Edge Functions pouze pro server-side operace

ARCHITEKTURA

Navrhni minimálně tyto koncepty:

users
devices
device_keys
contacts
contact_verification
conversations
conversation_members
messages
message_delivery
encrypted_attachments
push_tokens

Důležité:

messages nesmí obsahovat plaintext message body.

Použij například koncept:

message_id
conversation_id
sender_device_id
recipient_device_id
ciphertext
encrypted_metadata
created_at
expires_at
delivery_status

Databázové schéma musí být navrženo tak, aby RLS zabránilo uživateli přístupu k cizím datům.

DEVICE IDENTITY

Každé zařízení musí mít:

device_id

public identity key

pre-key mechanismus

device registration

device revocation

key rotation

Privátní část klíče nesmí opustit zařízení.

KRYPTOMĚCHANIKA

Zatím nevymýšlej vlastní kryptografický protokol.

Vytvoř pouze čistou abstrakční vrstvu:

CryptoProvider
KeyManager
IdentityManager
SessionManager
MessageEncryptor
MessageDecryptor

Implementace kryptografie musí být oddělená od UI a databáze, aby ji bylo možné později nahradit auditovanou kryptografickou knihovnou.

SECURITY ARCHITECTURE

Vytvoř také dokumentaci v projektu:

docs/SECURITY_ARCHITECTURE.md
docs/THREAT_MODEL.md
docs/CRYPTOGRAPHY.md
docs/DATA_MODEL.md

THREAT MODEL musí řešit minimálně:

kompromitovaný server

kompromitované zařízení

MITM útok

krádež session

replay attack

stolen database

leaked push token

compromised account

malicious contact

device replacement

revoked device

group membership changes

UI

Zatím vytvoř pouze základní design systém aplikace:

login / registration

onboarding

device setup

chat list

conversation screen

contacts

settings

security settings

device management

Nepřidávej zatím falešné bezpečnostní prvky.

Nepiš například "military-grade encryption" nebo "100% secure".

Každá bezpečnostní funkce musí být technicky podložená.

KÓD

Používej TypeScript strict mode.

Odděluj:

/src/features
/src/components
/src/lib
/src/crypto
/src/security
/src/services
/src/types

Nikdy nemíchej kryptografickou logiku přímo do React komponent.

Před implementací složitějších bezpečnostních mechanismů nejdříve vytvoř jasné interfaces a architekturu.

SUPABASE

Připrav databázové migrace.

Zapni RLS na všech uživatelských datech.

Nepoužívej service-role credentials ve frontendu.

Nikdy nevkládej secret keys do klientského kódu.

ENVIRONMENT VARIABLES

Veškeré secret konfigurace musí být přes environment variables.

VÝSLEDEK PRVNÍ FÁZE

Na konci této fáze chci:

funkční nový Lovable projekt

čistou architekturu

Supabase databázový základ

RLS policies

security documentation

oddělenou crypto abstraction layer

device identity model

základní UI

žádné plaintext zprávy ukládané na server

žádné předstírané šifrování

Důležité: Pokud nějaký požadavek nelze bezpečně implementovat pouze pomocí běžného Lovable/Supabase stacku, jasně ho označ a nevytvářej falešnou implementaci.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ffe444d4-2bff-4431-a094-6a1087dcc85f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
