import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { RequestContext } from '@mastra/core/di';
import { isValidationError } from '@mastra/core/tools';
import { pdfFetcherTool } from '../tools/download-pdf-tool';
import { generateQuestionsFromTextTool } from '../tools/generate-questions-from-text-tool';

// Define schemas for input and outputs
const pdfInputSchema = z.object({
  pdfUrl: z.string().describe('URL to a PDF file to download and process'),
});

const pdfSummarySchema = z.object({
  summary: z.string().describe('The AI-generated summary of the PDF content'),
  fileSize: z.number().describe('Size of the downloaded file in bytes'),
  pagesCount: z.number().describe('Number of pages in the PDF'),
  characterCount: z.number().describe('Number of characters extracted from the PDF'),
});

const questionsSchema = z.object({
  questions: z.array(z.string()).describe('The generated questions from the PDF content'),
  success: z.boolean().describe('Indicates if the question generation was successful'),
});

// Step 1: Download PDF and generate summary
const downloadAndSummarizePdfStep = createStep({
  id: 'download-and-summarize-pdf',
  description: 'Downloads PDF from URL and generates an AI summary',
  inputSchema: pdfInputSchema,
  outputSchema: pdfSummarySchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    console.log('Executing Step: download-and-summarize-pdf');
    const { pdfUrl } = inputData;

    const raw = await pdfFetcherTool.execute!(
      { pdfUrl },
      { mastra, requestContext: requestContext ?? new RequestContext() },
    );
    if (isValidationError(raw)) {
      throw new Error(`download-pdf-tool: ${raw.message}`);
    }

    console.log(
      `Step download-and-summarize-pdf: Succeeded - Downloaded ${raw.fileSize} bytes, extracted ${raw.characterCount} characters from ${raw.pagesCount} pages, generated ${raw.summary.length} character summary`,
    );

    return raw;
  },
});

// Step 2: Generate Questions from Summary
const generateQuestionsFromSummaryStep = createStep({
  id: 'generate-questions-from-summary',
  description: 'Generates questions from the AI-generated PDF summary',
  inputSchema: pdfSummarySchema,
  outputSchema: questionsSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    console.log('Executing Step: generate-questions-from-summary');

    const { summary } = inputData;

    if (!summary) {
      console.error('Missing summary in question generation step');
      return { questions: [], success: false };
    }

    try {
      const raw = await generateQuestionsFromTextTool.execute!(
        { extractedText: summary },
        { mastra, requestContext: requestContext ?? new RequestContext() },
      );
      if (isValidationError(raw)) {
        console.error('Step generate-questions-from-summary: validation error:', raw.message);
        return { questions: [], success: false };
      }

      console.log(
        `Step generate-questions-from-summary: Succeeded - Generated ${raw.questions.length} questions from summary`,
      );
      return { questions: raw.questions, success: raw.success };
    } catch (error) {
      console.error('Step generate-questions-from-summary: Failed - Error during generation:', error);
      return { questions: [], success: false };
    }
  },
});

// Define the workflow with simplified steps
export const pdfToQuestionsWorkflow = createWorkflow({
  id: 'generate-questions-from-pdf-workflow',
  description: 'Downloads PDF from URL, generates an AI summary, and creates questions from the summary',
  inputSchema: pdfInputSchema,
  outputSchema: questionsSchema,
})
  .then(downloadAndSummarizePdfStep)
  .then(generateQuestionsFromSummaryStep)
  .commit();
