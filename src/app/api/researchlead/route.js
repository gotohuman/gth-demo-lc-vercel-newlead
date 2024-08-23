export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { AiFlow } from "gotohuman";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";

export async function POST(request) {
  const req = await request.json()
  const model = new ChatOpenAI({ temperature: 0.75, model: "gpt-4o" });
  const aiFlow = new AiFlow({
    onTrigger: "newLead", agentId: "new-lead-researcher-lc", fetch: fetch.bind(globalThis)
  })
  aiFlow.step({id: "extractDomain", fn: async({flow, input}) => {
    return extractDomain(input[0].text)
  }})
  aiFlow.step({id: "summarizeWebsite", fn: async({input}) => {
    const scrapedWebsite = await readWebsiteContent(input);
    const summarizedWebsite = await summarizeWebsite(model, scrapedWebsite);
    return summarizedWebsite;
  }})
  aiFlow.step({id: "draftEmail", fn: async({input, config}) => {
    return await draftEmail(model, input, config.senderName, config.senderCompanyDesc);    
  }})
  aiFlow.gotoHuman({id: "approveDraft"})
  aiFlow.step({id: "sendEmail", fn: async({input}) => {
    // send email if `approved`
    await new Promise(resolve => setTimeout(resolve, 1000));
  }})
  const resp = await aiFlow.executeSteps(req);
  return Response.json(resp)
}

function extractDomain(email) {
  const domain = email.split('@').pop();
  const regex = createDomainRegex();
  return (!regex.test(domain)) ? `https://${domain}` : AiFlow.skipTo('draftEmail')
}

const commonProviders = [
  'gmail', 'yahoo', 'ymail', 'rocketmail',
  'outlook', 'hotmail', 'live', 'msn',
  'icloud', 'me', 'mac', 'aol',
  'zoho', 'protonmail', 'mail', 'gmx'
];

function createDomainRegex() {
  // Escape any special regex characters in the domain names
  const escapedDomains = commonProviders.map(domain => domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Join the domains with the alternation operator (|)
  const pattern = `(^|\\.)(${escapedDomains.join('|')})(\\.|$)`;
  return new RegExp(pattern);
}

async function readWebsiteContent(url) {
  const loader = new CheerioWebBaseLoader(url);
  
  const docs = await loader.load();
  return docs.length ? (docs[0]?.pageContent || "") : "";
}

async function summarizeWebsite(model, webContent) {
  const messages = [
    new SystemMessage("You are a helpful website content summarizer. You will be passed the content of a scraped company website. Please summarize it in 250-300 words focusing on what kind of company this is, the services they offer and how they operate."),
    new HumanMessage(webContent),
  ];
  
  const summaryCompletion = await model.invoke(messages);
  return summaryCompletion.content;
}

async function draftEmail(model, websiteContent, senderName, senderCompanyDesc) {
  const noDomain = (websiteContent == null)
  
  const messages = [
    new SystemMessage(`You are a helpful sales expert, great at writing enticing emails.
    You will write an email for ${senderName} who wants to reach out to a new prospect who left their email address. ${senderName} workd for the following company:
    ${senderCompanyDesc}
    Write no more than 300 words.
    ${!noDomain ? 'It must be tailored as much as possible to the prospect\'s company based on the website information we fetched. Don\'t mention that we got the information from the website.' : ''}`),
    new HumanMessage((noDomain ? `No additional information found abour the prospect` : `#Company website summary:
    ${websiteContent}`)),
  ];
  
  const emailDrafterCompletion = await model.invoke(messages);
  return emailDrafterCompletion.content;
}