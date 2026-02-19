package com.ivisit.helper.service;

import opennlp.tools.namefind.NameFinderME;
import opennlp.tools.namefind.TokenNameFinderModel;
import opennlp.tools.tokenize.SimpleTokenizer;
import opennlp.tools.util.Span;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

@Service
public class NameFinderService {

    private TokenNameFinderModel personModel;
    private final SimpleTokenizer tokenizer = SimpleTokenizer.INSTANCE;

    @PostConstruct
    public void init() throws IOException {
        ClassPathResource resource =
                new ClassPathResource("models/en-ner-person.bin");
        try (InputStream in = resource.getInputStream()) {
            this.personModel = new TokenNameFinderModel(in);
        }
    }

    public List<String> findPersonNames(String text) {
        List<String> names = new ArrayList<>();
        if (text == null || text.trim().isEmpty() || personModel == null) {
            return names;
        }

        String[] tokens = tokenizer.tokenize(text);
        NameFinderME finder = new NameFinderME(personModel);
        Span[] spans = finder.find(tokens);

        for (Span span : spans) {
            StringBuilder sb = new StringBuilder();
            for (int i = span.getStart(); i < span.getEnd(); i++) {
                if (i > span.getStart()) sb.append(" ");
                sb.append(tokens[i]);
            }
            names.add(sb.toString());
        }

        finder.clearAdaptiveData();
        return names;
    }
}
