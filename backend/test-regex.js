const text = '3. EPW analyzes democratic backsliding in India. [Source 24](ht…';
console.log(text.replace(/\[Source\s+\d+\](?:\([^)]*)?…$/, '…'));
