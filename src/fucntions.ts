import { exec } from 'child_process';
import util from 'util';
import { changes } from './extension';
import axios from 'axios';
import { lastCommitTime } from './extension';
import * as vscode from 'vscode';
let descriptionLanguage = 'en'; // Default language


const execPromise = util.promisify(exec);
// ...existing code...


export async function calculate_score(fileContent: string): Promise<number | null> {
    const prompt = `Review the following code and provide a score out of 100 based on its quality, readability, and adherence to best practices:\n\n${fileContent}\n\nScore:`;

    try {
        const response = await axios.post('https://api.openai.com/v1/completions', {
            model: "gpt-3.5-turbo-instruct",
            prompt: prompt,
            max_tokens: 10,
            temperature: 0.7,
        }, {
            headers: {
                'Authorization': `Bearer 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`
            }
        });

        const scoreText = (response.data as any).choices[0].text.trim();
        const score = parseInt(scoreText, 10);

        if (isNaN(score)) {
            console.error('Failed to parse score from response:', scoreText);
            return null;
        }

        return score;
    } catch (error) {
        console.error('Error generating score:', error);
        return null;
    }
}
export async function generateComments(fileContent: string): Promise<string | null> {
    const prompt = `Add comments to the following code. Ensure the comments are appropriate for the language of the code and use the correct comment symbols:\n\n${fileContent}\n\nComments:`;

    try {
        const response = await axios.post('https://api.openai.com/v1/completions', {
            model: "gpt-3.5-turbo-instruct",
            prompt: prompt,
            max_tokens: 150,
            temperature: 0.7,
        }, {
            headers: {
                'Authorization': `Bearer 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`}
            
        });

        const comments = (response.data as any).choices[0].text.trim();
        return comments;
    } catch (error) {
        console.error('Error generating comments:', error);
        return null;
    }
}

export async function selectBranch(branchName: string) {
    try {
        await execPromise(`git checkout ${branchName}`);
        console.log(`Switched to branch ${branchName}`);
    } catch (error) {
        console.error(`Error switching to branch ${branchName}:`, error);
    }
}
export async function generateDescription(): Promise<string | null> {
    const changesDescription = description_writer();
    const prompt = 'Generate a professional Git commit description that provides a concise summary of the changes, detailed categorization of the content (e.g., features, bug fixes, documentation updates, or refactoring), and includes relevant icons for each section to enhance readability (e.g., ✨ for features, 🐛 for bug fixes, 📚 for documentation, ♻️ for refactoring). Ensure the description explains why the changes were necessary, their impact, and provides any additional context, such as links to related issues, tickets, or pull requests. Structure the response to include a clear changelog with a summary, detailed descriptions under categorized headings, reasons for the changes, and references if applicable, making it professional and ready for use as a Git commit message.';

    try {
        const response = await axios.post('https://api.openai.com/v1/completions', {
            model: "gpt-3.5-turbo-instruct",
            prompt: prompt,
            max_tokens: 50,
            temperature: 0.7,
        }, {
            headers: {
			'Authorization': `Bearer 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`            }
        });

        const description = (response.data as any).choices[0].text.trim();
        return description;
    } catch (error) {
        console.error('Error generating description:', error);
        return null;
    }
}
export async function commitAndPushChanges() {
    try {
        // Generate commit description
        const description = await generateDescription();
        if (!description) {
            console.error('Failed to generate commit description');
            return;
        }

        // Stage all changes
        await execPromise('git add .');

        // Commit changes with generated description
        await execPromise(`git commit -m "${description}"`);

        // Push changes to the repository
        await execPromise('git push');
        
        console.log('Changes committed and pushed successfully');
    } catch (error) {
        console.error('Error committing and pushing changes:', error);
    }
}

// Function to change the language of the description
export function changeDescriptionLanguage(language: string) {
    descriptionLanguage = language;
    console.log(`Description language changed to ${language}`);
}

// Example usage
(async () => {
    await selectBranch('your-branch-name'); // Replace with your branch name
    changeDescriptionLanguage('en'); // Change to desired language code (e.g., 'es' for Spanish)
    await commitAndPushChanges();
})();

export function description_writer() {
    let description = 'Changes made:\n';
    for (const fileName in changes) {
        description += `File: ${fileName}\nChanges:\n`;
        changes[fileName].forEach(change => {
            description += `${change}\n`;
        });
        description += '\n';
    }
    console.log('Generated description:', description);
    return description;
}



// This method is called when your extension is deactivated
export function deactivate() {
    console.log('Bye, your extension "gitai" is now deactive!');
}


export function setCommitReminder() {
    if (lastCommitTime) {
        const oneHour = 60 * 60 * 1000; // One hour in milliseconds
        const timeSinceLastCommit = new Date().getTime() - lastCommitTime.getTime();

        if (timeSinceLastCommit >= oneHour) {
            vscode.window.showInformationMessage('It has been an hour since your last commit. Consider committing your changes.');
        } else {
            const timeUntilReminder = oneHour - timeSinceLastCommit;
            setTimeout(() => {
                vscode.window.showInformationMessage('It has been an hour since your last commit. Consider committing your changes.');
            }, timeUntilReminder);
        }
    } else {
        // If no last commit time is set, set a reminder for one hour from now
        setTimeout(() => {
            vscode.window.showInformationMessage('It has been an hour since your last commit. Consider committing your changes.');
        }, 60 * 60 * 1000);
    }
}